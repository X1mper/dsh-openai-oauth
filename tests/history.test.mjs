import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexAppServerAdapter } from '../lib/index.js'

class TextServer {
  threads = []; turns = []; events = []
  async startThread(input) { const id = `thread-${this.threads.length + 1}`; this.threads.push({ id, ...input }); return id }
  async startTurn(threadId, input) {
    this.turns.push({ threadId, ...input })
    this.events.push(
      { method: 'item/agentMessage/delta', params: { itemId: 'answer', delta: 'Checkpoint with actual task details' } },
      { method: 'item/completed', params: { item: { id: 'answer', type: 'agentMessage' } } },
      { method: 'turn/completed', params: { turn: { id: 'turn', status: 'completed' } } },
    )
    return 'turn'
  }
  async nextEvent() { return this.events.shift() }
}
const user = (text, id = text) => ({ id, role: 'user', content: [{ type: 'text', text }] })
const assistant = text => ({ role: 'assistant', content: [{ type: 'text', text }], source: { kind: 'model', provider: 'openai-codex', model: 'test', replayState: { kind: 'codex-app-server', version: 1, threadId: 'old-thread' } } })
const base = { provider: 'openai-codex', model: 'test', sessionId: 'main', system: 'system', tools: [{ name: 'echo', description: 'echo', parameters: {} }] }
const run = (adapter, options) => Array.fromAsync(adapter.stream({ ...base, ...options }))

class PendingServer extends TextServer {
  responses = []; interrupted = []; released = []; steered = []; operations = []; first = true
  async startTurn(thread, input) {
    const id = await super.startTurn(thread, input)
    if (this.first) {
      this.first = false
      this.events = [{ method: 'item/tool/call', requestId: 7, params: { callId: 'c', tool: 'echo', arguments: {} } }]
    }
    return id
  }
  async nextEvent(_, signal) {
    if (this.events.length) return this.events.shift()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {}, 100)
      const abort = () => { clearTimeout(timer); reject(signal.reason) }
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
    })
  }
  async interrupt(id) { this.interrupted.push(id); this.events = [] }
  async releaseThread(id) { this.released.push(id) }
  async steerTurn(threadId, expectedTurnId, text) {
    this.operations.push('steer')
    this.steered.push({ threadId, expectedTurnId, text })
  }
  respond(id, value) {
    this.operations.push('respond')
    this.responses.push({ id, value })
    this.events.push({ method: 'turn/completed', params: { turn: { id: 'turn', status: 'completed' } } })
  }
}
const callMessage = { role: 'assistant', content: [{ type: 'tool-call', id: 'c', name: 'echo', arguments: '{}' }] }
const replyMessage = { role: 'tool', toolCallId: 'c', content: [{ type: 'text', text: 'actual tool result' }] }

test('pending reply plus new instructions steers before answering tools without rebuilding', async () => {
  const server = new PendingServer(); const adapter = new CodexAppServerAdapter(server)
  const first = user('original requirement')
  await run(adapter, { messages: [first] })
  await run(adapter, { messages: [first, callMessage, replyMessage,
    user('STOP NEW IMPORTANT INSTRUCTION'), user('Agent report: preserve this too')] })
  assert.deepEqual(server.operations, ['steer', 'respond'])
  assert.equal(server.threads.length, 1)
  assert.equal(server.turns.length, 1)
  assert.deepEqual(server.interrupted, [])
  assert.deepEqual(server.steered, [{ threadId: 'thread-1', expectedTurnId: 'turn',
    text: 'STOP NEW IMPORTANT INSTRUCTION\n\nAgent report: preserve this too' }])
})

test('replaced pending history still rebuilds from the authoritative checkpoint', async () => {
  const server = new PendingServer(); const adapter = new CodexAppServerAdapter(server)
  await run(adapter, { messages: [user('original requirement')] })
  await run(adapter, { messages: [user('replacement checkpoint'), callMessage, replyMessage] })
  assert.equal(server.responses.length, 0)
  assert.deepEqual(server.interrupted, ['thread-1'])
  assert.equal(server.threads.length, 2)
  assert.match(server.turns.at(-1).input[0].text, /replacement checkpoint/)
  assert.match(server.turns.at(-1).input[0].text, /actual tool result/)
})

test('rejected steering never answers a tool or silently loses instructions', async () => {
  const server = new PendingServer(); const adapter = new CodexAppServerAdapter(server)
  server.steerTurn = async () => { throw Error('steer rejected') }
  const first = user('original')
  await run(adapter, { messages: [first] })
  await assert.rejects(run(adapter, { messages: [first, callMessage, replyMessage, user('new directive')] }), /steer rejected/)
  assert.equal(server.responses.length, 0)
  assert.deepEqual(server.interrupted, ['thread-1'])
})

test('ordinary canonical pending replies resume the same turn', async () => {
  const server = new PendingServer(); const adapter = new CodexAppServerAdapter(server)
  const first = user('original requirement')
  await run(adapter, { messages: [first] })
  await run(adapter, { messages: [first, callMessage, replyMessage] })
  assert.equal(server.responses.length, 1)
  assert.equal(server.threads.length, 1)
  assert.equal(server.turns.length, 1)
})

test('missing tool reply abandons pending turn before retry, without partial RPC replies', async () => {
  const server = new PendingServer(); const adapter = new CodexAppServerAdapter(server)
  const first = user('original requirement')
  await run(adapter, { messages: [first] })
  await assert.rejects(run(adapter, { messages: [first, callMessage] }), /Missing Harness result/)
  assert.deepEqual(server.interrupted, ['thread-1'])
  assert.deepEqual(server.released, ['thread-1'])
  assert.equal(server.responses.length, 0)
  await run(adapter, { messages: [first, callMessage, replyMessage] })
  assert.equal(server.threads.length, 2)
})

test('non-timeout transport failure during tool collection is not a successful tool boundary', async () => {
  const server = new PendingServer(); const adapter = new CodexAppServerAdapter(server)
  const next = server.nextEvent.bind(server)
  server.nextEvent = (...args) => server.events.length ? next(...args) : Promise.reject(new Error('process died'))
  await assert.rejects(run(adapter, { messages: [user('request')] }), /process died/)
  assert.deepEqual(server.interrupted, ['thread-1'])
  assert.deepEqual(server.released, ['thread-1'])
})


test('fresh adapter recovers ALL canonical history after restart without trusting obsolete thread replay', async () => {
  const server = new TextServer()
  const adapter = new CodexAppServerAdapter(server)
  const messages = [user('Earlier requirement: preserve context'), assistant('Earlier decision'),
    { role: 'assistant', content: [{ type: 'tool-call', id: 'call-7', name: 'echo', arguments: '{"x":1}' }] },
    { role: 'tool', toolCallId: 'call-7', isError: true, content: [{ type: 'text', text: 'permission denied' }] }, user('а щас?')]
  await run(adapter, { messages })
  const text = server.turns[0].input[0].text
  for (const value of ['Earlier requirement', 'Earlier decision', 'call-7', 'permission denied', 'а щас?', '"isError":true']) assert.ok(text.includes(value), value)
  assert.match(text, /already run/)
  assert.equal(server.threads.length, 1)
})

test('unchanged live conversation sends only new user text', async () => {
  const server = new TextServer(); const adapter = new CodexAppServerAdapter(server)
  const first = user('first')
  await run(adapter, { messages: [first] })
  await run(adapter, { messages: [first, assistant('Checkpoint with actual task details'), user('second')] })
  assert.equal(server.threads.length, 1)
  assert.equal(server.turns[1].input[0].text, 'second')
})

test('edited canonical assistant output rebuilds rather than retaining contradictory provider memory', async () => {
  const server = new TextServer(); const adapter = new CodexAppServerAdapter(server)
  const first = user('original')
  await run(adapter, { messages: [first] })
  await run(adapter, { messages: [first, assistant('edited answer, different from provider'), user('continue')] })
  assert.equal(server.threads.length, 2)
  assert.match(server.turns.at(-1).input[0].text, /edited answer/)
})

test('canonical history replacement after compaction rebuilds instead of leaking old context', async () => {
  const server = new TextServer(); const adapter = new CodexAppServerAdapter(server)
  await run(adapter, { messages: [user('stale removed detail'), assistant('answer'), user('continue')] })
  await run(adapter, { messages: [user('checkpoint: authoritative task'), assistant('answer'), user('continue')] })
  assert.equal(server.threads.length, 2)
  assert.match(server.turns[1].input[0].text, /checkpoint: authoritative task/)
  assert.doesNotMatch(server.turns[1].input[0].text, /stale removed detail/)
})

for (const purpose of ['compaction', 'session-title']) {
  test(`${purpose} accepts soft token budget and stays isolated from conversation with same sessionId`, async () => {
    const server = new TextServer(); const adapter = new CodexAppServerAdapter(server)
    const initial = user('private task')
    await run(adapter, { messages: [initial] })
    const chunks = await run(adapter, { purpose, maxTokens: 2048, messages: [initial, assistant('decision'), user('summarize now')] })
    assert.equal(server.threads[1].ephemeral, true)
    assert.deepEqual(server.threads[1].dynamicTools, [])
    assert.match(server.threads[1].baseInstructions, /2048 tokens/)
    assert.match(server.turns[1].input[0].text, /decision/)
    assert.ok(chunks.some(chunk => chunk.type === 'block-end' && chunk.block.text.includes('Checkpoint')))
    await run(adapter, { messages: [initial, assistant('Checkpoint with actual task details'), user('continue')] })
    assert.equal(server.threads.length, 2)
    assert.equal(server.turns[2].threadId, 'thread-1')
    assert.equal(server.turns[2].input[0].text, 'continue')
  })
}

test('normal unsupported controls remain errors, auxiliary invalid budget rejected', async () => {
  const adapter = new CodexAppServerAdapter(new TextServer())
  for (const controls of [{ maxTokens: 10 }, { temperature: .2 }, { stop: ['x'] }]) {
    await assert.rejects(() => run(adapter, { ...controls, messages: [] }), /does not expose/)
  }
  await assert.rejects(() => run(adapter, { purpose: 'compaction', maxTokens: -1, messages: [] }), /positive integer/)
})

test('model, system, or tool changes rebuild canonical history safely', async () => {
  const server = new TextServer(); const adapter = new CodexAppServerAdapter(server)
  const messages = [user('first'), assistant('answer'), user('next')]
  await run(adapter, { messages })
  await run(adapter, { messages, model: 'other' })
  await run(adapter, { messages, model: 'other', system: 'new instructions' })
  await run(adapter, { messages, model: 'other', system: 'new instructions', tools: [] })
  assert.equal(server.threads.length, 4)
  for (const turn of server.turns) assert.match(turn.input[0].text, /first/)
})

test('large recovery and compaction use isolated bounded summaries and include usage', async () => {
  for (const purpose of [undefined, 'compaction']) {
    const server = new TextServer()
    const start = server.startTurn.bind(server)
    server.startTurn = async (...args) => {
      assert.ok(args[1].input.reduce((n, item) => n + item.text.length, 0) <= 200_000)
      const id = await start(...args)
      server.events.unshift({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { total: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 2, reasoningOutputTokens: 0, totalTokens: 12 } } } })
      return id
    }
    const adapter = new CodexAppServerAdapter(server)
    const chunks = await run(adapter, { purpose, maxTokens: purpose ? 1024 : undefined,
      messages: [user('earlier facts ' + 'x'.repeat(1_785_217)), assistant('old decision'), user('CURRENT REQUEST')] })
    assert.ok(server.turns.length > 2)
    assert.ok(server.turns.at(-1).input[0].text.endsWith('CURRENT REQUEST' + '"}]}]'))
    assert.match(server.turns.at(-1).input[0].text, /semantically summarized/)
    const summaryThreads = server.threads.filter(t => t.baseInstructions.includes('untrusted fragment'))
    assert.ok(summaryThreads.length > 1)
    assert.ok(summaryThreads.every(t => t.ephemeral && t.dynamicTools.length === 0))
    const usage = chunks.filter(c => c.type === 'usage').at(-1).usage
    // Harness assembler keeps the LAST usage snapshot, not the sum of chunks.
    assert.equal(usage.inputTokens, server.turns.length * 10)
    assert.equal(usage.outputTokens, server.turns.length * 2)
    assert.equal(usage.totalTokens, server.turns.length * 12)
  }
})

test('recovery emits visible progress before starting summary work', async () => {
  const server = new TextServer()
  const adapter = new CodexAppServerAdapter(server)
  const iterator = adapter.stream({ ...base, messages: [user('x'.repeat(250_000))] })
  const first = await iterator.next()
  assert.equal(first.value.type, 'block-start')
  assert.equal(first.value.blockType, 'reasoning')
  assert.equal(server.turns.length, 0)
  const progress = await iterator.next()
  assert.match(progress.value.text, /Восстановление истории/)
  await iterator.return()
  assert.equal(server.turns.length, 0)
})

test('startTurn RPC rejection invalidates session before a full canonical retry', async () => {
  const server = new TextServer(); const adapter = new CodexAppServerAdapter(server)
  const start = server.startTurn.bind(server)
  let fail = true
  server.startTurn = async (...args) => { if (fail) { fail = false; throw Error('RPC rejected') }; return start(...args) }
  const messages = [user('important'), assistant('decision'), user('continue')]
  await assert.rejects(run(adapter, { messages }), /RPC rejected/)
  await run(adapter, { messages })
  assert.equal(server.threads.length, 2)
  assert.match(server.turns[0].input[0].text, /important/)
})

test('auxiliary threads are released and early iterator close interrupts a live turn', async () => {
  const server = new TextServer(); server.released = []; server.interrupted = []
  server.releaseThread = async id => { server.released.push(id) }
  server.interrupt = async id => { server.interrupted.push(id) }
  const adapter = new CodexAppServerAdapter(server)
  await run(adapter, { purpose: 'compaction', maxTokens: 100, messages: [user('summarize')] })
  assert.deepEqual(server.released, ['thread-1'])
  const iterator = adapter.stream({ ...base, messages: [user('stream')] })
  await iterator.next()
  await iterator.return()
  assert.deepEqual(server.interrupted, ['thread-2'])
  assert.deepEqual(server.released, ['thread-1', 'thread-2'])
  await run(adapter, { messages: [user('stream')] })
  assert.equal(server.threads.length, 3)
})

test('model change while paused on tools rebuilds canonical history without resuming stale RPC', async () => {
  const server = new TextServer()
  const start = server.startTurn.bind(server)
  let call = true
  server.startTurn = async (...args) => {
    const id = await start(...args)
    if (call) {
      call = false
      server.events = [{ method: 'item/tool/call', requestId: 7, params: { callId: 'c', tool: 'echo', arguments: {} } }]
    }
    return id
  }
  // collectToolCalls uses a timeout; this fake must actually wait when empty.
  server.nextEvent = async (_, signal) => {
    if (server.events.length) return server.events.shift()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {}, 100)
      const abort = () => { clearTimeout(timer); reject(signal.reason) }
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
    })
  }
  const interrupted = []
  server.interrupt = async id => interrupted.push(id)
  const adapter = new CodexAppServerAdapter(server)
  const first = user('earlier requirement')
  await run(adapter, { messages: [first] })
  await run(adapter, { model: 'other', messages: [first,
    { role: 'assistant', content: [{ type: 'tool-call', id: 'c', name: 'echo', arguments: '{}' }] },
    { role: 'tool', toolCallId: 'c', content: [{ type: 'text', text: 'actual result' }] }] })
  assert.deepEqual(interrupted, ['thread-1'])
  assert.equal(server.threads.length, 2)
  assert.match(server.turns[1].input[0].text, /earlier requirement/)
  assert.match(server.turns[1].input[0].text, /actual result/)
})

test('failed turn invalidates provider state before retrying canonical history', async () => {
  const server = new TextServer(); const adapter = new CodexAppServerAdapter(server)
  const start = server.startTurn.bind(server)
  server.startTurn = async (...args) => {
    await start(...args)
    server.events = [{ method: 'turn/completed', params: { turn: { id: 'turn', status: 'failed', error: { message: 'transient failure' } } } }]
    return 'turn'
  }
  const messages = [user('important context'), assistant('decision'), user('continue')]
  await assert.rejects(() => run(adapter, { messages }), /transient failure/)
  server.startTurn = start
  await run(adapter, { messages })
  assert.equal(server.threads.length, 2)
  assert.match(server.turns[1].input[0].text, /important context/)
})

function completedMessage(chunks) {
  return { role: 'assistant', content: chunks.filter(c => c.type === 'block-end').map(c => c.block),
    source: { kind: 'model', provider: base.provider, model: base.model,
      replayState: chunks.findLast(c => c.type === 'finish').replayState } }
}

test('restart resumes verified completed thread and sends only new input', async () => {
  const server = new TextServer(); const first = user('original facts')
  const chunks = await run(new CodexAppServerAdapter(server), { messages: [first] })
  const message = completedMessage(chunks)
  server.resumeCompletedThread = async (threadId, turnId) => {
    assert.equal(threadId, 'thread-1'); assert.equal(turnId, 'turn'); return true
  }
  await run(new CodexAppServerAdapter(server), { messages: [first, message, user('continue')] })
  assert.equal(server.threads.length, 1)
  assert.equal(server.turns.at(-1).input[0].text, 'continue')
})

for (const change of ['history', 'assistant', 'model', 'session', 'remote', 'pending']) {
  test(`restart rejects incompatible ${change} checkpoint`, async () => {
    const server = new TextServer(); let first = user('original facts')
    const chunks = await run(new CodexAppServerAdapter(server), { messages: [first] })
    const message = completedMessage(chunks)
    let resumes = 0
    server.resumeCompletedThread = async () => { resumes++; return false }
    if (change === 'history') first = user('edited history')
    if (change === 'assistant') message.content = [{ type: 'text', text: 'edited answer' }]
    if (change === 'pending') message.source.replayState.resumable = false
    await run(new CodexAppServerAdapter(server), { messages: [first, message, user('continue')],
      ...(change === 'model' ? { model: 'other' } : {}), ...(change === 'session' ? { sessionId: 'fork' } : {}) })
    assert.equal(resumes, change === 'remote' ? 1 : 0)
    assert.equal(server.threads.length, 2)
  })
}

test('retryable Codex errors wait for terminal completion', async () => {
  const server = new TextServer(); const start = server.startTurn.bind(server)
  server.startTurn = async (...args) => {
    const id = await start(...args)
    server.events.unshift({ method: 'error', params: { willRetry: true, error: { message: 'reconnecting' } } })
    return id
  }
  const chunks = await run(new CodexAppServerAdapter(server), { messages: [user('hello')] })
  assert.equal(chunks.at(-1).reason.kind, 'stop')
})

test('oversized history plus repeated agent inbox arrivals keeps one thread without summaries', async () => {
  const server = new PendingServer(); const adapter = new CodexAppServerAdapter(server)
  const first = user('original task ' + 'x'.repeat(180_000))
  const largeReply = { ...replyMessage, content: [{ type: 'text', text: 'tool output ' + 'y'.repeat(80_000) }] }
  const messages = [first]
  await run(adapter, { messages })
  const respond = server.respond.bind(server)
  server.respond = (id, result) => {
    respond(id, result)
    if (server.responses.length === 1) server.events = [{ method: 'item/tool/call', requestId: 8,
      params: { callId: 'c2', tool: 'echo', arguments: {} } }]
  }
  messages.push(callMessage, largeReply, user('Agent one: new finding'))
  const chunks = await run(adapter, { messages })
  messages.push({ role: 'assistant', content: [{ type: 'tool-call', id: 'c2', name: 'echo', arguments: '{}' }] },
    { ...replyMessage, toolCallId: 'c2' }, user('Agent two: another finding'))
  const next = await run(adapter, { messages })
  assert.equal(server.threads.length, 1)
  assert.equal(server.turns.length, 1)
  assert.equal(server.steered.length, 2)
  assert.equal(server.responses.length, 2)
  assert.ok([...chunks, ...next].every(c => c.type !== 'reasoning-delta'))
})

test('resumed usage excludes previously billed cumulative tokens', async () => {
  const server = new TextServer(); const start = server.startTurn.bind(server)
  let total = 10
  server.startTurn = async (...args) => {
    const id = await start(...args)
    server.events.unshift({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { total: {
      inputTokens: total, cachedInputTokens: 0, outputTokens: 2, reasoningOutputTokens: 0, totalTokens: total + 2,
    } } } })
    return id
  }
  const first = user('task')
  const chunks = await run(new CodexAppServerAdapter(server), { messages: [first] })
  total = 15
  server.resumeCompletedThread = async () => true
  const next = await run(new CodexAppServerAdapter(server), { messages: [first, completedMessage(chunks), user('next')] })
  assert.equal(next.find(c => c.type === 'usage').usage.totalTokens, 5)
})
