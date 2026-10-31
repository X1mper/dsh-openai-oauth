import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexWebFetchProvider } from '../lib/web-fetch.js'
const url = 'https://example.com/'
class Server {
  events = []; released = []; interrupted = []; threads = []
  native = { type: 'webSearch', action: { type: 'openPage', url }, results: [{ type: 'text_result', ref_id: 'view0', url }] }
  output = { ok: true, content: 'Example Domain', truncated: false }
  async account() { return { type: 'chatgpt' } }
  async models() { return [{ model: 'test', isDefault: true }] }
  async startThread(input) { this.threads.push(input); return 'fetch' }
  async startTurn() {
    this.events.push({ method: 'item/completed', params: { item: this.native } },
      { method: 'item/completed', params: { item: { type: 'agentMessage', text: JSON.stringify(this.output) } } },
      { method: 'turn/completed', params: { turn: { status: 'completed' } } })
    return 'turn'
  }
  async nextEvent() { return this.events.shift() }
  async releaseThread(id) { this.released.push(id) }
  async interrupt(id) { this.interrupted.push(id) }
}
test('fetch requires exact native open, labels extraction and never invents HTTP status', async () => {
  const server = new Server(), audit = []
  const result = await new CodexWebFetchProvider(server, () => 'test', e => audit.push(e)).fetch({ url })
  assert.equal(result.statusCode, 0)
  assert.match(result.body.content, /HTTP status is unavailable/)
  assert.match(result.body.content, /Example Domain/)
  assert.equal(result.body.kind, 'text')
  assert.equal(audit[0].nativeOpen, true)
  assert.equal(server.threads[0].ephemeral, true)
  assert.deepEqual(server.threads[0].dynamicTools, [])
  assert.deepEqual(server.released, ['fetch'])
})
test('search, unrelated open and failed native open cannot masquerade as a page', async () => {
  for (const native of [ { type: 'webSearch', action: { type: 'search' } },
    { type: 'webSearch', action: { type: 'openPage', url: 'https://example.org/' } },
    { type: 'webSearch', action: { type: 'openPage', url }, results: [] } ]) {
    const server = new Server(); server.native = native
    await assert.rejects(new CodexWebFetchProvider(server).fetch({ url }), /did not open/)
    assert.deepEqual(server.released, ['fetch'])
  }
})
test('invalid requests and cancellation do not create a thread', async () => {
  const server = new Server(), provider = new CodexWebFetchProvider(server)
  for (const url of ['file:///etc/passwd', 'https://user:secret@example.com/', 'not a URL']) await assert.rejects(provider.fetch({ url }), /Invalid/)
  await assert.rejects(provider.fetch({ url }, AbortSignal.abort()), { name: 'AbortError' })
  assert.equal(server.threads.length, 0)
})
test('running cancellation interrupts and releases fetch thread', async () => {
  const server = new Server(), controller = new AbortController()
  server.nextEvent = async (_, signal) => { controller.abort(); signal.throwIfAborted() }
  await assert.rejects(new CodexWebFetchProvider(server).fetch({ url }, controller.signal), { name: 'AbortError' })
  assert.deepEqual(server.interrupted, ['fetch']); assert.deepEqual(server.released, ['fetch'])
})
test('malformed and failed extraction rejected, long extraction capped', async () => {
  for (const output of [null, {}, { ok: false, content: 'failed', truncated: false }, { ok: true, content: '', truncated: false }]) {
    const server = new Server(); server.output = output
    await assert.rejects(new CodexWebFetchProvider(server).fetch({ url }))
  }
  const server = new Server(); server.output.content = 'x'.repeat(41000)
  const result = await new CodexWebFetchProvider(server).fetch({ url })
  assert.equal(result.truncated, true); assert.ok(result.body.content.length < 40500)
})
