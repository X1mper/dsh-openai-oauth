import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

test('model listing follows cursors in order and uses only the selected account cache', async () => {
  const { AppServer } = await import('../lib/app-server.js')
  const root = await mkdtemp(join(tmpdir(), 'dsh-model-catalog-'))
  try {
    const homes = ['primary', 'named', 'uncached'].map(name => join(root, name))
    for (const [index, size] of [200000, 120000].entries()) {
      await mkdir(homes[index])
      await writeFile(join(homes[index], 'models_cache.json'), JSON.stringify({
        fetched_at: new Date().toISOString(),
        models: [{ slug: 'one', context_window: size }, { slug: 'two', context_window: size, effective_context_window_percent: 50 }],
      }))
    }
    const results = await Promise.all(homes.map(async home => {
      const server = new AppServer(home)
      const calls = []
      const pages = [
        { data: [{ id: 'alias', model: 'one' }], nextCursor: 'c1' },
        { data: [], nextCursor: 'c2' },
        { data: [{ id: 'two' }, { id: 'three', contextWindow: 123 }], nextCursor: null },
      ]
      server.request = async (method, params) => {
        assert.equal(method, 'model/list')
        calls.push(params)
        return pages.shift()
      }
      const models = await server.models()
      assert.deepEqual(calls, [{}, { cursor: 'c1' }, { cursor: 'c2' }])
      assert.deepEqual(models.map(model => model.id), ['alias', 'two', 'three'])
      return models.map(model => model.contextWindow)
    }))
    assert.deepEqual(results, [[200000, 100000, 123], [120000, 60000, 123], [undefined, undefined, 123]])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('model listing rejects repeated cursors and malformed pages', async () => {
  const { AppServer } = await import('../lib/app-server.js')
  const server = new AppServer()
  let calls = 0
  server.request = async () => {
    assert.ok(++calls <= 2)
    return { data: [], nextCursor: 'repeat' }
  }
  await assert.rejects(server.models(), /Invalid Codex model catalog cursor/)
  server.request = async () => ({ data: [null], nextCursor: null })
  await assert.rejects(server.models(), /Invalid Codex model catalog page/)
  server.request = async () => ({ data: [], nextCursor: 7 })
  await assert.rejects(server.models(), /Invalid Codex model catalog cursor/)
})

test('process-death queues reject future reads and discard stale queued tool calls', async () => {
  const { AppServer } = await import('../lib/app-server.js')
  const server = new AppServer()
  const queue = server.queue('dead-thread')
  queue.push({ method: 'item/tool/call', params: {} })
  const error = new Error('process exited')
  queue.fail(error)
  await assert.rejects(server.nextEvent('dead-thread'), error)
  queue.push({ method: 'item/tool/call', params: {} })
  await assert.rejects(server.nextEvent('dead-thread'), error)
  const waiting = server.nextEvent('another-thread')
  server.queue('another-thread').fail(error)
  await assert.rejects(waiting, error)
})


test('starts Codex from its isolated home without loading Harness project config', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-codex-workspace-'))
  const codexHome = join(workspace, '.deepseek-harness', 'codex')
  await mkdir(join(workspace, '.codex'), { recursive: true })
  await writeFile(join(workspace, '.codex', 'config.toml'), 'model = "gpt-5.6-sol"\n')

  try {
    const appServer = resolve('lib/app-server.js')
    const script = `
      const { AppServer } = await import(${JSON.stringify(appServer)});
      const server = new AppServer();
      await server.start();
      server.close();
    `
    const { stderr } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: workspace,
      env: { ...process.env, DSH_CODEX_HOME: codexHome },
      timeout: 15_000,
    })

    assert.doesNotMatch(stderr, /Project-local config, hooks, and exec policies are disabled/)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('steering targets the active turn and resume verifies persisted latest turn', async () => {
  const { AppServer } = await import('../lib/app-server.js')
  const server = new AppServer(); const calls = []
  server.request = async (method, params) => {
    calls.push({ method, params })
    if (method === 'skills/list') return { data: [{ skills: [], errors: [] }] }
    if (method === 'thread/turns/list') return { data: [{ id: 'done', status: 'completed' }] }
    return {}
  }
  await server.steerTurn('thread', 'active', 'new instruction')
  assert.deepEqual(calls[0], { method: 'turn/steer', params: {
    threadId: 'thread', expectedTurnId: 'active', input: [{ type: 'text', text: 'new instruction' }],
  } })
  server.queue('thread').fail(new Error('old process'))
  assert.equal(await server.resumeCompletedThread('thread', 'done'), true)
  assert.equal(calls.at(-1).params.itemsView, 'notLoaded')
  const resumed = calls.find(call => call.method === 'thread/resume').params
  assert.deepEqual(resumed.config['skills.config'], [])
  assert.equal(resumed.config['features.sleep_tool'], false)
  assert.equal(resumed.config['features.multi_agent_v2'], false)
  assert.equal(resumed.config['agents.enabled'], false)
  server.queue('thread').push({ method: 'turn/started', params: {} })
  assert.equal((await server.nextEvent('thread')).method, 'turn/started')
  assert.equal(await server.resumeCompletedThread('thread', 'stale'), false)
})

test('thread isolation disables every discovered skill without changing Harness tools or auxiliary features', async () => {
  const { AppServer } = await import('../lib/app-server.js')
  const server = new AppServer(); const calls = []
  let names = ['imagegen', 'openai-docs', 'future-skill']
  server.request = async (method, params) => {
    calls.push({ method, params })
    if (method === 'skills/list') return { data: [{ skills: names.map(name => ({ path: '/skills/' + name + '/SKILL.md' })), errors: [] }] }
    return { thread: { id: 'isolated' } }
  }
  const input = { cwd: '/project', dynamicTools: [{ name: 'image_generate' }, { name: 'skill' }],
    config: { 'features.image_generation': true, web_search: 'live',
      'features.multi_agent_v2': true, 'agents.enabled': true } }
  await server.startThread(input)
  assert.deepEqual(calls[0], { method: 'skills/list', params: { cwds: ['/project'], forceReload: true } })
  const started = calls.at(-1).params
  assert.deepEqual(started.dynamicTools, input.dynamicTools)
  assert.equal(started.config['features.image_generation'], true)
  assert.equal(started.config.web_search, 'live')
  assert.equal(started.config['features.sleep_tool'], false)
  assert.equal(started.config['features.multi_agent'], false)
  assert.equal(started.config['features.multi_agent_v2'], false)
  assert.equal(started.config['agents.enabled'], false)
  assert.deepEqual(started.config['skills.config'], names.map(name => ({ path: '/skills/' + name + '/SKILL.md', enabled: false })))
  assert.equal(input.config['skills.config'], undefined)
  names.push('newly-installed')
  await server.startThread(input)
  assert.equal(calls.at(-1).params.config['skills.config'].length, 4)
})

test('skill discovery failures cannot silently launch an unisolated thread', async () => {
  const { AppServer } = await import('../lib/app-server.js')
  for (const result of [{}, { data: [] }, { data: [{ skills: [], errors: ['failed'] }] },
    { data: [{ skills: [{}], errors: [] }] }]) {
    const server = new AppServer()
    server.request = async method => { assert.equal(method, 'skills/list'); return result }
    await assert.rejects(server.startThread({ cwd: '/project' }), /Cannot isolate Codex skills/)
  }
})

test('JSON-RPC failures preserve code and structured data without JSON in the message', async () => {
  const { AppServer } = await import('../lib/app-server.js')
  const { CodexRpcError } = await import('../lib/rpc-error.js')
  const server = new AppServer()
  const pending = new Promise((resolve, reject) => server.pending.set(17, { resolve, reject }))
  server.receive({ id: 17, error: { code: -32000, message: 'Context exhausted', data: { codexErrorInfo: 'contextWindowExceeded' } } })
  await assert.rejects(pending, error => {
    assert.ok(error instanceof CodexRpcError)
    assert.equal(error.message, 'Context exhausted')
    assert.equal(error.code, -32000)
    assert.deepEqual(error.data, { codexErrorInfo: 'contextWindowExceeded' })
    return true
  })
  assert.equal(server.pending.size, 0)
})
