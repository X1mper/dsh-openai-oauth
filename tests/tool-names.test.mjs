import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { CodexAppServerAdapter } from '../lib/index.js'

const reserved = 'mcp__pi_lavtomate__bug_add_comment'
const aliasBase = 'dsh_' + createHash('sha256').update(reserved).digest('hex').slice(0, 48)
const options = names => ({
  provider: 'openai-codex', model: 'test',
  messages: [{ id: 'u', role: 'user', content: [{ type: 'text', text: 'test' }] }],
  tools: names.map(name => ({ name, description: name, parameters: { type: 'object' } })),
})

class Server {
  events = []
  async startThread(input) { this.input = input; return 'thread' }
  async startTurn() {
    const tool = this.input.dynamicTools.find(tool => tool.description === reserved)
    this.events.push({ method: 'item/tool/call', requestId: 1,
      params: { callId: 'call', tool: this.unknown ?? tool.name, arguments: { text: 'hello' } } })
    return 'turn'
  }
  async nextEvent(_, signal) {
    if (this.events.length) return this.events.shift()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {}, 100)
      const abort = () => { clearTimeout(timer); reject(signal.reason) }
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    })
  }
}

test('reserved MCP names are safely aliased and mapped back on every output surface', async () => {
  const server = new Server()
  const chunks = await Array.fromAsync(new CodexAppServerAdapter(server).stream(options([reserved, 'echo'])))
  assert.equal(server.input.dynamicTools[0].name, aliasBase)
  assert.equal(server.input.dynamicTools[1].name, 'echo')
  assert.deepEqual(server.input.dynamicTools[0].inputSchema, { type: 'object' })
  for (const chunk of chunks) {
    if (chunk.type === 'tool-call-delta') assert.equal(chunk.name, reserved)
    if (chunk.type === 'block-end' && chunk.block.type === 'tool-call') {
      assert.equal(chunk.block.name, reserved)
      assert.equal(chunk.block.arguments, '{"text":"hello"}')
    }
  }
})

test('aliases avoid supplied names and are independent of tool order', async () => {
  const names = [reserved, aliasBase, aliasBase + '_1', 'mcp__other__tool', 'echo']
  const mappings = []
  for (const order of [names, [...names].reverse()]) {
    const server = new Server()
    await Array.fromAsync(new CodexAppServerAdapter(server).stream(options(order)))
    const specs = server.input.dynamicTools
    assert.equal(new Set(specs.map(tool => tool.name)).size, names.length)
    assert.ok(specs.every(tool => !tool.name.startsWith('mcp__')))
    assert.ok(specs.every(tool => tool.name.length <= 64))
    const mapping = Object.fromEntries(specs.map(tool => [tool.description, tool.name]))
    assert.equal(mapping[reserved], aliasBase + '_2')
    assert.equal(mapping[aliasBase], aliasBase)
    mappings.push(mapping)
  }
  assert.deepEqual(mappings[0], mappings[1])
})

test('unknown model tool names fail closed rather than reaching Harness dispatch', async () => {
  const server = new Server()
  server.unknown = reserved
  await assert.rejects(Array.fromAsync(new CodexAppServerAdapter(server).stream(options([reserved]))),
    /Unknown Codex dynamic tool/)
})


test('adapter sends Codex-compatible coordinate schema for a reserved MCP tool', async () => {
  const server = new Server()
  const input = options([reserved])
  input.tools[0].parameters = { type: 'object', properties: { coordinate: {
    type: 'array', items: [{ type: 'number' }, { type: 'number' }], additionalItems: false,
  } } }
  await Array.fromAsync(new CodexAppServerAdapter(server).stream(input))
  assert.deepEqual(server.input.dynamicTools[0].inputSchema.properties.coordinate.items, { type: 'number' })
  assert.equal(server.input.dynamicTools[0].inputSchema.properties.coordinate.maxItems, 2)
  assert.ok(Array.isArray(input.tools[0].parameters.properties.coordinate.items))
})

for (const name of ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']) {
 test(`native resource discovery collision is aliased and round-trips: ${name}`, async()=>{
  const server=new Server()
  server.startTurn=async()=>{
   const tool=server.input.dynamicTools.find(t=>t.description===name)
   assert.notEqual(tool.name,name)
   server.events.push({method:'item/tool/call',requestId:1,params:{callId:'call',tool:tool.name,arguments:{}}})
   return 'turn'
  }
  const chunks=await Array.fromAsync(new CodexAppServerAdapter(server).stream(options([name])))
  assert.equal(chunks.find(c=>c.type==='block-end').block.name,name)
 })
}
