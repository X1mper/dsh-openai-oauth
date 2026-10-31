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
  const result = Array.fromAsync(new CodexAppServerAdapter(server).stream({
    ...base,
    signal: controller.signal,
    messages: [{ id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'wait' }] }],
  }))
  controller.abort()
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
