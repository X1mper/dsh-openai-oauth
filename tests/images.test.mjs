import assert from 'node:assert/strict'
import test from 'node:test'
import { ImageBridge } from '../lib/images.js'
import { CodexAppServerAdapter } from '../lib/index.js'
const ref = { attachmentId: 'image-1', mediaType: 'image/png', bytes: 3, width: 2, height: 2 }
const picture = { type: 'image', attachment: ref }
const reads = []
const store = { async readImage(attachment) { reads.push(attachment); return { ref: attachment, data: new Uint8Array([1, 2, 3]) } } }
const url = 'data:image/png;base64,AQID'
class Server {
  threads = []; turns = []; events = []; responses = []; steers = []
  async startThread(input) { this.threads.push(input); return 'thread' }
  async startTurn(thread, input) { this.turns.push(input); this.events.push({method:'item/agentMessage/delta',params:{itemId:'answer',delta:'Image inspected'}}, {method:'item/completed',params:{item:{id:'answer',type:'agentMessage'}}}, { method: 'turn/completed', params: { turn: { id: 'turn', status: 'completed' } } }); return 'turn' }
  async nextEvent(_, signal) {
    if (this.events.length) return this.events.shift()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {}, 100)
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
    })
  }
  async steerTurn(...args) { this.steers.push(args) }
  respond(id, result) { this.responses.push(result); this.events.push({method:'item/agentMessage/delta',params:{itemId:'answer',delta:'Image inspected'}}, {method:'item/completed',params:{item:{id:'answer',type:'agentMessage'}}}, { method: 'turn/completed', params: { turn: { id: 'turn', status: 'completed' } } }) }
  async interrupt() {}
  async releaseThread() {}
}
const base = { provider: 'openai-codex', model: 'test', sessionId: 'images', tools: [{ name: 'screen', description: 'screen', parameters: {} }] }
const user = content => ({ role: 'user', content })
const run = (adapter, messages) => Array.fromAsync(adapter.stream({ ...base, messages }))

test('ordered tool text and images become native image content; nested legacy results work', async () => {
  const bridge = new ImageBridge(store)
  assert.deepEqual(await bridge.toolContent([{ type: 'text', text: 'before' }, picture,
    { type: 'tool-result', toolCallId: 'nested', content: [picture] }, { type: 'text', text: 'after' }]), [
    { type: 'inputText', text: 'before' }, { type: 'inputImage', imageUrl: url },
    { type: 'inputImage', imageUrl: url }, { type: 'inputText', text: 'after' },
  ])
})

test('new and rebuilt history carries actual images with role/id labels, not base64 in transcript', async () => {
  const server = new Server(); const adapter = new CodexAppServerAdapter(server, undefined, store)
  await run(adapter, [user([{ type: 'text', text: 'describe' }, picture])])
  assert.equal(server.turns[0].input.at(-1).url, url)
  assert.match(server.turns[0].input.at(-2).text, /image-1.*user/)
  assert.ok(!server.turns[0].input[0].text.includes('base64'))
  const restarted = new CodexAppServerAdapter(server, undefined, store)
  await run(restarted, [user([picture]), { role: 'tool', toolCallId: 'old', content: [picture] }, user([{ type: 'text', text: 'compare' }])])
  assert.equal(server.turns[1].input.filter(p => p.type === 'image').length, 2)
})

async function paused() {
  const server = new Server()
  server.startTurn = async function (thread, input) {
    this.turns.push(input)
    this.events.push({ method: 'item/tool/call', requestId: 1, params: { callId: 'call', tool: 'screen', arguments: {} } })
    return 'turn'
  }
  const adapter = new CodexAppServerAdapter(server, undefined, store)
  const first = user([{ type: 'text', text: 'screenshot' }])
  const chunks = await run(adapter, [first])
  const assistant = { role: 'assistant', content: chunks.filter(c => c.type === 'block-end').map(c => c.block) }
  return { server, adapter, messages: [first, assistant] }
}

test('Offscreen-style image tool result and new image instruction keep the paused thread', async () => {
  const { server, adapter, messages } = await paused()
  await run(adapter, [...messages, { role: 'tool', toolCallId: 'call', content: [picture] }, user([picture])])
  assert.equal(server.threads.length, 1)
  assert.deepEqual(server.responses[0].contentItems, [{ type: 'inputImage', imageUrl: url }])
  assert.equal(server.steers[0][2].at(-1).url, url)
})

test('unavailable image fails instead of silently dropping pixels or delivering partial results', async () => {
  const { server, adapter, messages } = await paused()
  adapter.images = new ImageBridge({ async readImage() { throw Error('attachment missing') } })
  await assert.rejects(run(adapter, [...messages, { role: 'tool', toolCallId: 'call', content: [picture] }]), /attachment missing/)
  assert.equal(server.responses.length, 0)
  await assert.rejects(new ImageBridge().toolContent([picture]), /attachment storage/)
})

test('offloaded images and cancellation do not read or resend pixels', async () => {
  const bridge = new ImageBridge({ async readImage() { throw Error('must not read') } })
  assert.deepEqual(await bridge.historyImages([user([{ ...picture, offloaded: true }])]), [])
  assert.match((await bridge.toolContent([{ ...picture, offloaded: true }]))[0].text, /offloaded image/)
  await assert.rejects(bridge.toolContent([picture], AbortSignal.abort()), { name: 'AbortError' })
})
