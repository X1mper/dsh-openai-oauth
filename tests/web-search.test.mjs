import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexWebSearchProvider, parseSearchResult } from '../lib/web-search.js'
test('search pins the selected account server throughout an asynchronous call', async () => {
  const a = new Server(), b = new Server(); let selected = a
  a.account = async () => { selected = b; return { type: 'chatgpt' } }
  const provider = new CodexWebSearchProvider(() => selected)
  await provider.search({ query: 'one' })
  assert.equal(a.threads.length, 1); assert.equal(b.threads.length, 0)
  await provider.search({ query: 'two' })
  assert.equal(b.threads.length, 1)
})
const source = { url: 'https://example.com/page', title: 'Example', snippet: 'A fact' }
class Server {
  threads = []; turns = []; events = []; released = []; interrupted = []
  async account() { return { type: 'chatgpt' } }
  async models() { return [{ model: 'test', isDefault: true }] }
  async startThread(input) { this.threads.push(input); return 'search' }
  async startTurn(threadId, input) {
    this.turns.push({ threadId, ...input })
    this.events.push({ method: 'item/completed', params: { item: { id: 'web', type: 'webSearch' } } },
      { method: 'item/agentMessage/delta', params: { itemId: 'answer', delta: JSON.stringify({ sources: [source] }) } },
      { method: 'item/completed', params: { item: { id: 'answer', type: 'agentMessage' } } },
      { method: 'turn/completed', params: { turn: { status: 'completed' } } })
    return 'turn'
  }
  async nextEvent() { return this.events.shift() }
  async interrupt(thread, turn) { this.interrupted.push({ thread, turn }) }
  async releaseThread(thread) { this.released.push(thread) }
}

test('native search runs in isolated live-search thread and returns Harness sources', async () => {
  const server = new Server(); const audit = []
  const result = await new CodexWebSearchProvider(server, () => 'test', e => audit.push(e)).search({ query: 'question' })
  assert.deepEqual(result, { sources: [source], truncated: false })
  assert.equal(server.threads[0].ephemeral, true)
  assert.deepEqual(server.threads[0].config, { web_search: 'live' })
  assert.deepEqual(server.threads[0].dynamicTools, [])
  assert.deepEqual(server.threads[0].environments, [])
  assert.ok(server.turns[0].outputSchema)
  assert.deepEqual(server.released, ['search'])
  assert.equal(audit[0].nativeSearch, true)
})

test('model response without a native search is rejected', async () => {
  const server = new Server(); const start = server.startTurn.bind(server)
  server.startTurn = async (...args) => { const id = await start(...args); server.events.shift(); return id }
  await assert.rejects(new CodexWebSearchProvider(server).search({ query: 'question' }), /did not perform native web search/)
  assert.deepEqual(server.released, ['search'])
})

test('search cancellation interrupts and releases the auxiliary thread', async () => {
  const server = new Server(); const controller = new AbortController()
  server.nextEvent = async (_, signal) => { controller.abort(); signal.throwIfAborted() }
  await assert.rejects(new CodexWebSearchProvider(server).search({ query: 'question' }, controller.signal), { name: 'AbortError' })
  assert.deepEqual(server.interrupted, [{ thread: 'search', turn: 'turn' }])
  assert.deepEqual(server.released, ['search'])
})

test('missing login and pre-cancellation never create a thread', async () => {
  const server = new Server(); server.account = async () => null
  await assert.rejects(new CodexWebSearchProvider(server).search({ query: 'question' }), /Sign in/)
  await assert.rejects(new CodexWebSearchProvider(server).search({ query: 'question' }, AbortSignal.abort()), { name: 'AbortError' })
  assert.equal(server.threads.length, 0)
})

test('source parser deduplicates and bounds results, rejecting unsafe or malformed output', () => {
  const other = { url: 'https://example.org/', title: 'Other' }
  assert.deepEqual(parseSearchResult(JSON.stringify({ sources: [source, source, other] }), 1), { sources: [source], truncated: true })
  for (const text of ['not JSON', '{}', '{"sources":[null]}', '{"sources":[{"url":"javascript:alert(1)"}]}',
    '{"sources":[{"url":"https://user:pass@example.org/"}]}']) assert.throws(() => parseSearchResult(text))
})

test('terminal errors fail and retryable errors wait for search completion', async () => {
  for (const willRetry of [false, true]) {
    const server = new Server(); const start = server.startTurn.bind(server)
    server.startTurn = async (...args) => {
      const id = await start(...args)
      server.events.unshift({ method: 'error', params: { willRetry, error: { message: 'network failure' } } })
      return id
    }
    const result = new CodexWebSearchProvider(server).search({ query: 'question' })
    if (willRetry) assert.equal((await result).sources.length, 1)
    else await assert.rejects(result, /network failure/)
    assert.deepEqual(server.released, ['search'])
  }
})
