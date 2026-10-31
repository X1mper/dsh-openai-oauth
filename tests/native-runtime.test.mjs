import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, createUserMessage, createSystemMessage } from '@deepseek-ai/dsh-llm'
import { CodexAppServerAdapter } from '../lib/adapter.js'
import { CodexRpcError } from '../lib/rpc-error.js'

function fixture() {
  const ctx = new Context()
  const server = {
    events: [], threads: [], inputs: [],
    async account() { return { type: 'chatgpt' } },
    async models() { return [{ model: 'fixture', inputModalities: ['text'], contextWindow: 128000 }] },
    async startThread(input) { this.threads.push(input); return `thread-${this.threads.length}` },
    async startTurn(id, input) {
      this.inputs.push(input)
      this.events.push(
        { method: 'item/agentMessage/delta', params: { itemId: 'answer', delta: 'Native answer' } },
        { method: 'item/completed', params: { item: { id: 'answer', type: 'agentMessage' } } },
        { method: 'turn/completed', params: { turn: { id: 'turn', status: 'completed' } } },
      )
      return 'turn'
    },
    async nextEvent() { return this.events.shift() },
    async releaseThread() {}, async interrupt() {},
  }
  const runtime = new LlmRuntime(ctx)
  const dispose = runtime.registerAdapter(['openai-codex'], new CodexAppServerAdapter(server))
  return { ctx, server, runtime, dispose }
}
const request = () => ({ provider: 'openai-codex', model: 'fixture', tools: [], messages: [
  createSystemMessage('Native system policy'),
  createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello' }] }),
] })

test('native runtime middleware wraps Codex requests and sees terminal outcomes', async () => {
  const { ctx, server, runtime, dispose } = fixture()
  const seen = []
  ctx.on('llm/stream', async function* (options, next) {
    seen.push(options.provider)
    for await (const chunk of next()) { seen.push(chunk.type); yield chunk }
  })
  const chunks = await Array.fromAsync(runtime.stream(request()))
  assert.equal(chunks.at(-1).reason.kind, 'stop')
  assert.equal(seen[0], 'openai-codex')
  assert.equal(seen.at(-1), 'finish')
  assert.match(server.threads[0].baseInstructions, /Native system policy/)
  dispose()
  const disabled = await Array.fromAsync(runtime.stream(request()))
  assert.equal(disabled.at(-1).reason.kind, 'error')
  assert.equal(server.threads.length, 1)
})

test('native file and text-only image projections reach Codex without mutating history', async () => {
  const { ctx, server, runtime } = fixture()
  ctx.provide('attachments', { fileHostPath: () => '/host/report.txt' })
  ctx.provide('fs', { processPathFromHostPath: () => '/workspace/report.txt' })
  const options = request()
  options.messages[1] = createUserMessage({ source: { kind: 'user' }, content: [
    { type: 'file', attachment: { attachmentId: 'sha256:1234567890', name: 'report.txt', bytes: 42, mediaType: 'text/plain' } },
    { type: 'image', attachment: { attachmentId: 'sha256:abcdef1234', mediaType: 'image/png', width: 32, height: 32 } },
  ] })
  const before = JSON.stringify(options.messages)
  const chunks = await Array.fromAsync(runtime.stream(options))
  assert.equal(chunks.at(-1).reason.kind, 'stop')
  assert.match(server.inputs[0].input[0].text, /report.txt/)
  assert.match(server.inputs[0].input[0].text, /\/workspace\/report.txt/)
  assert.match(server.inputs[0].input[0].text, /image omitted/)
  assert.equal(JSON.stringify(options.messages), before)
})

test('RPC context overflow becomes the native terminal failure consumed by compaction', async () => {
  const { server, runtime } = fixture()
  server.startTurn = async () => { throw new CodexRpcError({ message: 'Context full', data: { codexErrorInfo: 'contextWindowExceeded' } }) }
  const chunks = await Array.fromAsync(runtime.stream(request()))
  assert.equal(chunks.at(-1).reason.kind, 'error')
  assert.equal(chunks.at(-1).reason.failure.code, 'CONTEXT_WINDOW_EXCEEDED')
})
