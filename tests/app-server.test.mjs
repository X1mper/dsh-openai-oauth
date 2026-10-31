import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

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
  server.queue('thread').push({ method: 'turn/started', params: {} })
  assert.equal((await server.nextEvent('thread')).method, 'turn/started')
  assert.equal(await server.resumeCompletedThread('thread', 'stale'), false)
})
