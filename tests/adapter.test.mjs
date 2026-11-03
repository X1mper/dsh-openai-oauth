import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexAppServerAdapter } from '../lib/index.js'

class FakeServer {
  events = []
  responses = []
  turnInput = ''

  async account() { return { type: 'chatgpt' } }
  async models() {
    return [{
      id: 'gpt-5.6-sol', model: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', hidden: false,
      inputModalities: ['text', 'image'], defaultReasoningEffort: 'high',
      supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'High' }],
    }]
  }
  async startThread(input) { this.threadInput = input; return 'thread-1' }
  async startTurn(_threadId, input) {
    this.turnPolicy = input.sandboxPolicy
    this.turnInput = input.input[0].text
    this.events.push({
      method: 'item/tool/call', requestId: 7,
      params: { threadId: 'thread-1', callId: 'call-1', tool: 'echo', arguments: { text: 'ping' } },
    })
    return 'turn-1'
  }
  nextEvent(_threadId, signal) {
    const event = this.events.shift()
    if (event) return Promise.resolve(event)
    return new Promise((_resolve, reject) => {
      const timer = setTimeout(() => {}, 100)
      const abort = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
    })
  }
  respond(id, result) {
    this.responses.push({ id, result })
    this.events.push(
      { method: 'item/agentMessage/delta', params: { threadId: 'thread-1', itemId: 'answer', delta: 'pong' } },
      { method: 'item/completed', params: { threadId: 'thread-1', item: { id: 'answer', type: 'agentMessage' } } },
      { method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } },
    )
  }
}

const base = {
  provider: 'openai-codex', model: 'gpt-5.6-sol', sessionId: 'session-1',
  tools: [{ name: 'echo', description: 'echo', parameters: { type: 'object' } }],
}

test('bridges a Codex dynamic tool call across two Harness model steps', async () => {
  const server = new FakeServer()
  const adapter = new CodexAppServerAdapter(server)
  const first = await Array.fromAsync(adapter.stream({
    ...base,
    messages: [
      { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'ping' }] },
      { id: 'u2', role: 'user', source: { kind: 'plugin', plugin: 'context' }, content: [{ type: 'text', text: 'runtime context' }] },
    ],
  }))
  assert.equal(server.turnInput, 'ping\n\nruntime context')
  assert.deepEqual(server.turnPolicy, { type: 'externalSandbox', networkAccess: 'enabled' })
  assert.equal(server.threadInput.sandbox, 'read-only')
  assert.deepEqual(server.threadInput.environments, [])
  assert.equal(server.threadInput.approvalPolicy, 'never')
  assert.match(server.threadInput.developerInstructions, /outside the Codex native-tool sandbox/)
  assert.match(server.threadInput.developerInstructions, /including denials and approval requirements/)
  assert.deepEqual(first.at(-1).reason, { kind: 'tool-calls' })
  assert.equal(first.find(chunk => chunk.type === 'block-end').block.id, 'call-1')

  const second = await Array.fromAsync(adapter.stream({
    ...base,
    messages: [
      { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'ping' }] },
      { id: 'u2', role: 'user', source: { kind: 'plugin', plugin: 'context' }, content: [{ type: 'text', text: 'runtime context' }] },
      { id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'openai-codex', model: 'gpt-5.6-sol' }, content: [{ type: 'tool-call', id: 'call-1', name: 'echo', arguments: '{"text":"ping"}' }] },
      { id: 't1', role: 'user', source: { kind: 'tool', callId: 'call-1' }, content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: 'pong-from-harness' }], isError: false }] },
    ],
  }))
  assert.equal(server.responses[0].result.contentItems[0].text, 'pong-from-harness')
  assert.equal(second.find(chunk => chunk.type === 'block-end').block.text, 'pong')
  assert.deepEqual(second.at(-1).reason, { kind: 'stop' })
})

test('preserves a Harness permission denial when returning a dynamic tool result', async () => {
  const server = new FakeServer()
  const adapter = new CodexAppServerAdapter(server)
  await Array.fromAsync(adapter.stream({
    ...base,
    messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: 'write' }] }],
  }))
  await Array.fromAsync(adapter.stream({
    ...base,
    messages: [{ role: 'user', content: [{
      type: 'tool-result', toolCallId: 'call-1', isError: true,
      content: [{ type: 'text', text: 'Harness denied write: current file policy is read-only.' }],
    }] }],
  }))
  assert.equal(server.responses[0].result.success, false)
  assert.equal(server.responses[0].result.contentItems[0].text,
    'Harness denied write: current file policy is read-only.')
})

test('discovers models from Codex instead of hardcoding GPT versions', async () => {
  const adapter = new CodexAppServerAdapter(new FakeServer())
  const models = await adapter.listModels('openai-codex')
  assert.equal(models[0].id, 'gpt-5.6-sol')
})

test('interrupts the Codex turn when Harness cancels', async () => {
  const server = new FakeServer()
  let interrupted = false
  server.startTurn = async () => 'turn-1'
  server.interrupt = async () => { interrupted = true }
  const controller = new AbortController()
  // Cancel after turn/start, not before the adapter has allocated any turn.
  server.startTurn = async () => { queueMicrotask(() => controller.abort()); return 'turn-1' }
  const result = Array.fromAsync(new CodexAppServerAdapter(server).stream({
    ...base,
    signal: controller.signal,
    messages: [{ id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'wait' }] }],
  }))
  await assert.rejects(result)
  assert.equal(interrupted, true)
})

for (const denied of [false, true]) {
  test(`accepts Harness 0.2 tool-role results (denied=${denied})`, async () => {
    const server = new FakeServer()
    const adapter = new CodexAppServerAdapter(server)
    await Array.fromAsync(adapter.stream({ ...base, messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: 'write' }] }] }))
    await Array.fromAsync(adapter.stream({ ...base, messages: [{ role: 'tool', toolCallId: 'call-1', isError: denied, content: [{ type: 'text', text: denied ? 'Denied by Harness' : 'Saved by Harness' }] }] }))
    assert.equal(server.responses[0].result.success, !denied)
    assert.equal(server.responses[0].result.contentItems[0].text, denied ? 'Denied by Harness' : 'Saved by Harness')
  })
}


test('uses each Harness session directory instead of the plugin process directory', async () => {
  const directories = new Map([['session-1', '/tmp/harness-workspace-one'], ['session-2', '/tmp/harness-workspace-two']])
  const server = new FakeServer()
  const adapter = new CodexAppServerAdapter(server, id => directories.get(id))
  for (const sessionId of directories.keys()) {
    await Array.fromAsync(adapter.stream({ ...base, sessionId, messages: [
      { id: 'u1', role: 'user', content: [{ type: 'text', text: 'ping' }] },
    ] }))
    assert.equal(server.threadInput.cwd, directories.get(sessionId))
    assert.notEqual(server.threadInput.cwd, process.cwd())
    assert.deepEqual(server.threadInput.environments, [])
    assert.equal(server.threadInput.sandbox, 'read-only')
  }
})

test('rejects a relative session directory instead of resolving it against process cwd', async () => {
  const server = new FakeServer()
  const adapter = new CodexAppServerAdapter(server, () => 'relative/workspace')
  await assert.rejects(async () => Array.fromAsync(adapter.stream({ ...base, messages: [] })), /must be absolute/)
  assert.equal(server.threadInput, undefined)
})

function usageEvent(inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens = 0) {
  const total = { inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens, totalTokens: inputTokens + outputTokens }
  return { method: 'thread/tokenUsage/updated', params: { threadId: 'thread-1', turnId: 'turn-1', tokenUsage: { total, last: total } } }
}

test('emits actual usage at tool boundaries, including notifications inside the tool burst', async () => {
  const server = new FakeServer()
  const start = server.startTurn.bind(server)
  server.startTurn = async (...args) => {
    const id = await start(...args)
    server.events.push(usageEvent(100, 60, 20, 8))
    return id
  }
  const respond = server.respond.bind(server)
  server.respond = (...args) => {
    respond(...args)
    server.events.splice(-1, 0, usageEvent(260, 200, 35, 13), usageEvent(260, 200, 35, 13))
  }
  const adapter = new CodexAppServerAdapter(server)
  const first = await Array.fromAsync(adapter.stream({ ...base, messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }] }))
  assert.deepEqual(first.filter(c => c.type === 'usage').map(c => c.usage), [{ inputTokens: 40, outputTokens: 20, cacheReadTokens: 60, cacheWriteTokens: 0, reasoningTokens: 8, totalTokens: 120, contextUsage: { inputTokens: 100, outputTokens: 20, resetsOnHistoryChange: true } }])
  assert.equal(first.at(-1).type, 'finish')
  const second = await Array.fromAsync(adapter.stream({ ...base, messages: [{ role: 'tool', toolCallId: 'call-1', content: [{ type: 'text', text: 'done' }] }] }))
  assert.deepEqual(second.filter(c => c.type === 'usage').map(c => c.usage), [{ inputTokens: 20, outputTokens: 15, cacheReadTokens: 140, cacheWriteTokens: 0, reasoningTokens: 5, totalTokens: 175, contextUsage: null }])
  assert.equal(second.at(-1).type, 'finish')
})

test('emits no fabricated usage for a server without token notifications', async () => {
  const adapter = new CodexAppServerAdapter(new FakeServer())
  const chunks = await Array.fromAsync(adapter.stream({ ...base, messages: [] }))
  assert.equal(chunks.some(c => c.type === 'usage'), false)
})

for (const terminal of ['error', 'failed']) test(`capacity failure through ${terminal} preserves billing and reports SERVER`, async () => {
  const server = new FakeServer()
  const failure = { message: 'Selected model is at capacity. Please try a different model.', codexErrorInfo: 'serverOverloaded' }
  let starts = 0
  const threads = [], released = []
  server.startThread = async () => { const id = `thread-${threads.length + 1}`; threads.push(id); return id }
  server.releaseThread = async id => { released.push(id) }
  server.startTurn = async (_thread, input) => {
    starts++
    server.turnInput = input.input[0].text
    if (starts > 1) {
      server.events.push({ method: 'item/agentMessage/delta', params: { itemId: 'answer', delta: 'ok' } },
        { method: 'item/completed', params: { item: { id: 'answer', type: 'agentMessage' } } },
        { method: 'turn/completed', params: { turn: { id: 'turn-2', status: 'completed' } } })
      return 'turn-2'
    }
    server.events.push(usageEvent(10, 2, 5, 1), terminal === 'error'
      ? { method: 'error', params: { error: failure, willRetry: false } }
      : { method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'failed', error: failure } } })
    return 'turn-1'
  }
  const chunks = []
  const adapter = new CodexAppServerAdapter(server)
  const messages = [{ role: 'user', content: [{ type: 'text', text: 'canonical context' }] }]
  await assert.rejects(async () => { for await (const chunk of adapter.stream({ ...base, messages })) chunks.push(chunk) },
    e => e.code === 'SERVER' && e.message === failure.message)
  assert.equal(starts, 1)
  assert.equal(chunks.find(c => c.type === 'usage').usage.totalTokens, 15)
  assert.equal(chunks.find(c => c.type === 'usage').usage.contextUsage, null)
  await Array.fromAsync(adapter.stream({ ...base, messages }))
  assert.deepEqual(threads, ['thread-1', 'thread-2'])
  assert.deepEqual(released, ['thread-1'])
  assert.match(server.turnInput, /canonical context/)
})

test('preserves observed usage before surfacing a failed turn', async () => {
  const server = new FakeServer()
  server.startTurn = async () => {
    server.events.push(usageEvent(10, 2, 5, 1), { method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'failed', error: { message: 'test failure' } } } })
    return 'turn-1'
  }
  const chunks = []
  await assert.rejects(async () => {
    for await (const chunk of new CodexAppServerAdapter(server).stream({ ...base, messages: [] })) chunks.push(chunk)
  }, /test failure/)
  assert.equal(chunks.filter(c => c.type === 'usage').length, 1)
  assert.equal(chunks.find(c => c.type === 'usage').usage.totalTokens, 15)
  assert.equal(chunks.find(c => c.type === 'usage').usage.contextUsage, null)
})

for (const terminal of ['interrupted', 'error']) test(`invalidates context sample on ${terminal} without discarding billing`, async () => {
  const server = new FakeServer()
  server.startTurn = async () => {
    server.events.push(usageEvent(10, 2, 5, 1), terminal === 'error'
      ? { method: 'error', params: { error: { message: 'test failure' } } }
      : { method: 'turn/completed', params: { turn: { id: 'turn-1', status: terminal } } })
    return 'turn-1'
  }
  const chunks = []
  const run = async () => { for await (const chunk of new CodexAppServerAdapter(server).stream({ ...base, messages: [] })) chunks.push(chunk) }
  if (terminal === 'error') await assert.rejects(run, /test failure/)
  else await run()
  assert.equal(chunks.find(c => c.type === 'usage').usage.totalTokens, 15)
  assert.equal(chunks.find(c => c.type === 'usage').usage.contextUsage, null)
})

test('effective catalog context is exposed and live provider capacity takes precedence', async () => {
  const server = new FakeServer()
  const models = server.models.bind(server)
  server.models = async () => (await models()).map(m => ({...m,contextWindow:190000}))
  server.startTurn = async () => {
    server.events.push({method:'thread/tokenUsage/updated',params:{tokenUsage:{modelContextWindow:180000}}},
      {method:'item/agentMessage/delta',params:{itemId:'answer',delta:'ok'}},
      {method:'item/completed',params:{item:{id:'answer',type:'agentMessage'}}},
      {method:'turn/completed',params:{turn:{status:'completed'}}})
    return 'turn'
  }
  const adapter = new CodexAppServerAdapter(server)
  assert.equal((await adapter.resolveModel(base.provider,base.model)).context.contextWindow,190000)
  await Array.fromAsync(adapter.stream({...base,messages:[{role:'user',content:[{type:'text',text:'hello'}]}]}))
  assert.equal((await adapter.resolveModel(base.provider,base.model)).context.contextWindow,180000)
})


test('empty completed response is a recoverable provider failure, not a successful silent answer', async () => {
 const server = new FakeServer()
 server.startTurn=async()=>{server.events.push({method:'turn/completed',params:{turn:{status:'completed'}}});return 'turn'}
 await assert.rejects(Array.fromAsync(new CodexAppServerAdapter(server).stream({...base,messages:[]})),e=>e.code==='EMPTY_RESPONSE')
})

for (const method of ['startThread', 'startTurn']) {
  test(`RPC overflow at ${method} reaches native Harness recovery`, async () => {
    const { CodexRpcError } = await import('../lib/rpc-error.js')
    const server = new FakeServer()
    server[method] = async () => { throw new CodexRpcError({ code: -32000, message: 'Context exhausted', data: { codexErrorInfo: 'contextWindowExceeded' } }) }
    const adapter = new CodexAppServerAdapter(server)
    await assert.rejects(Array.fromAsync(adapter.stream({ ...base, messages: [
      { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'ping' }] },
    ] })), error => error.code === 'CONTEXT_WINDOW_EXCEEDED' && error.message === 'Context exhausted')
  })
}

test('account failure during model resolution preserves credential classification', async () => {
  const { CodexRpcError } = await import('../lib/rpc-error.js')
  const server = new FakeServer()
  server.account = async () => { throw new CodexRpcError({ code: -32000, message: 'Login expired', data: { codexErrorInfo: 'unauthorized' } }) }
  await assert.rejects(new CodexAppServerAdapter(server).resolveModel(base.provider, base.model), error => error.code === 'INVALID_CREDENTIAL')
})
