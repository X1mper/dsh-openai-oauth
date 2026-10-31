import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexImageGenerator, resolveEditImages, applyImageTools } from '../lib/image-generation.js'
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
const ref = { attachmentId: 'fixture', mediaType: 'image/png', bytes: bytes.length, width: 1, height: 1 }
class Server {
  threads = []; turns = []; events = []; released = []; interrupted = []
  image = { type: 'imageGeneration', status: 'completed', failure: null, result: bytes.toString('base64'), generationId: 'generated' }
  async account() { return { type: 'chatgpt' } }
  async request() { return { imageGeneration: true } }
  async models() { return [{ model: 'test', isDefault: true }] }
  async startThread(input) { this.threads.push(input); return 'image' }
  async startTurn(_, input) {
    this.turns.push(input)
    this.events.push({ method: 'item/completed', params: { item: this.image } }, { method: 'turn/completed', params: { turn: { status: 'completed' } } })
    return 'turn'
  }
  async nextEvent() { return this.events.shift() }
  async releaseThread(id) { this.released.push(id) }
  async interrupt(id) { this.interrupted.push(id) }
}
function setup() {
  const server = new Server(), saved = [], audit = []
  const store = { async readImage(request) { assert.deepEqual(request, ref); return { ref, data: bytes } }, async saveImage(input) { saved.push(input); return { ...ref, attachmentId: 'new' } } }
  return { server, store, saved, audit, generator: new CodexImageGenerator(server, store) }
}
test('generation persists native bytes and restricts the auxiliary thread', async () => {
  const { generator, server, saved, audit } = setup()
  const result = await generator.run('generate', { prompt: 'red circle' }, [], undefined, undefined, e => audit.push(e))
  assert.equal(result.image.attachmentId, 'new'); assert.deepEqual(saved[0].data, bytes)
  assert.equal(server.threads[0].config['features.image_generation'], true)
  assert.equal(server.threads[0].sandbox, 'read-only'); assert.deepEqual(server.threads[0].dynamicTools, [])
  assert.equal(audit[0].nativeImage, true); assert.deepEqual(server.released, ['image'])
})
test('edit supplies exact attachment bytes as native images without filesystem access', async () => {
  const { generator, server } = setup()
  const result = await generator.run('edit', { prompt: 'make blue', image_ids: ['fixture'] }, [{ content: [{ type: 'image', attachment: ref }] }])
  assert.equal(result.mode, 'edit')
  assert.deepEqual(server.threads[0].environments, [])
  assert.equal(server.threads[0].cwd, undefined)
  assert.deepEqual(server.turns[0].input[1], { type: 'image', url: `data:image/png;base64,${bytes.toString('base64')}` })
  assert.equal(JSON.parse(server.turns[0].input[0].text).input_image_count, 1)
  assert.ok(!server.turns[0].input[0].text.includes('referenced_image_paths'))
})
test('edit refuses unknown, offloaded and out-of-conversation images before starting', async () => {
  const { generator, server } = setup()
  for (const messages of [[], [{ content: [{ type: 'image', attachment: ref, offloaded: true }] }]]) {
    await assert.rejects(generator.run('edit', { prompt: 'edit', image_ids: ['fixture'] }, messages), /not an active attachment/)
  }
  assert.equal(server.threads.length, 0)
  assert.deepEqual(resolveEditImages(['fixture'], [{ content: [{ type: 'tool-result', content: [{ type: 'image', attachment: ref }] }] }]), [ref])
})
test('failed, missing, corrupt and file-only native output never becomes an attachment', async () => {
  for (const image of [{ type: 'agentMessage' }, { type: 'imageGeneration', status: 'failed' },
    { type: 'imageGeneration', status: 'completed', result: 'not base64' },
    { type: 'imageGeneration', status: 'completed', fileId: 'file', savedPath: '/etc/passwd' }]) {
    const { generator, server, saved } = setup(); server.image = image
    await assert.rejects(generator.run('generate', { prompt: 'circle' }, []))
    assert.equal(saved.length, 0); assert.deepEqual(server.released, ['image'])
  }
})
test('cancellation interrupts active generation, saves nothing', async () => {
  const { generator, server, saved } = setup(); const controller = new AbortController()
  server.nextEvent = async (_, signal) => { controller.abort(); signal.throwIfAborted() }
  await assert.rejects(generator.run('generate', { prompt: 'circle' }, [], undefined, controller.signal), { name: 'AbortError' })
  assert.deepEqual(server.interrupted, ['image']); assert.equal(saved.length, 0)
})
test('invalid modes of input and unavailable capability never start a generation', async () => {
  const { generator, server } = setup()
  for (const [mode, request] of [['edit', { prompt: 'edit' }], ['generate', { prompt: 'x', image_ids: ['fixture'] }], ['generate', { prompt: '' }]]) await assert.rejects(generator.run(mode, request, []))
  server.request = async () => ({ imageGeneration: false })
  await assert.rejects(generator.run('generate', { prompt: 'circle' }, []), /unavailable/)
  assert.equal(server.threads.length, 0)
})
test('Harness tools render generated attachments and require session context', async () => {
  const registered = [], { server, store } = setup()
  applyImageTools({ attachments: store, tools: { register(tool) { registered.push(tool) } } }, server)
  assert.deepEqual(registered.map(t => t.name), ['image_generate', 'image_edit'])
  const content = registered[0].output.render({}, { image: ref, mode: 'generate', generationId: null })
  assert.equal(content[1].type, 'image'); assert.equal(content[1].attachment, ref)
  await assert.rejects(registered[0].execute({ prompt: 'circle' }, { signal: AbortSignal.timeout(1000) }), /require a Harness conversation/)
})

test('requested transparency must be confirmed by native generation metadata', async () => {
  const { generator, server, saved } = setup()
  await assert.rejects(generator.run('generate', { prompt: 'circle', transparent_background: true }, []), /transparent background/)
  assert.equal(saved.length, 0)
  server.image.transparentBackground = true
  const result = await generator.run('generate', { prompt: 'circle', transparent_background: true }, [])
  assert.equal(result.mode, 'generate')
})
