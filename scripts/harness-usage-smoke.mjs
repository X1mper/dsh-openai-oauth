// Offline integration: use the installed Harness tokenUsage fold, without login or model requests.
// DSH_RUNTIME_ROOT=/path/to/node_modules/@deepseek-ai node scripts/harness-usage-smoke.mjs
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CodexAppServerAdapter } from '../lib/index.js'

assert.ok(process.env.DSH_RUNTIME_ROOT, 'Set DSH_RUNTIME_ROOT to the installed @deepseek-ai package directory')
const { tokenUsageProjectionDefinition: projection } = await import(pathToFileURL(resolve(process.env.DSH_RUNTIME_ROOT, 'dsh-token-meter/lib/types/usage-projection.js')).href)
function notification(inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens) {
  const total = { inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens, totalTokens: inputTokens + outputTokens }
  return { method: 'thread/tokenUsage/updated', params: { threadId: 'offline-thread', tokenUsage: { total, last: total } } }
}
const events = []
const server = {
  async startThread() { return 'offline-thread' },
  async startTurn() {
    events.push({ method: 'item/tool/call', requestId: 1, params: { threadId: 'offline-thread', callId: 'offline-call', tool: 'read', arguments: { file_path: 'fixture' } } }, notification(100, 60, 20, 8))
    return 'offline-turn'
  },
  nextEvent(_thread, signal) {
    if (events.length) return Promise.resolve(events.shift())
    return new Promise((_resolve, reject) => {
      const timer = setTimeout(() => {}, 100)
      const abort = () => { clearTimeout(timer); reject(signal.reason) }
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    })
  },
  respond() {
    events.push(notification(260, 200, 35, 13), notification(260, 200, 35, 13), { method: 'turn/completed', params: { threadId: 'offline-thread', turn: { id: 'offline-turn', status: 'completed' } } })
  },
}
const adapter = new CodexAppServerAdapter(server)
const base = { provider: 'openai-codex', model: 'offline-fixture', sessionId: 'offline-session', tools: [{ name: 'read', description: 'fixture', parameters: { type: 'object' } }] }
const streams = [await Array.fromAsync(adapter.stream({ ...base, messages: [{ role: 'user', content: [{ type: 'text', text: 'fixture' }] }] })), await Array.fromAsync(adapter.stream({ ...base, messages: [{ role: 'tool', toolCallId: 'offline-call', content: [{ type: 'text', text: 'fixture result' }] }] }))]
let state = projection.init()
for (let index = 0; index < streams.length; index++) {
  const usage = streams[index].find(chunk => chunk.type === 'usage')?.usage
  assert.ok(usage)
  const event = { type: 'assistant/message', seq: index, time: 0, data: { turn: 1, step: index + 1, usage, stream: [] } }
  state = projection.apply(state, event)
  state = projection.apply(state, event) // The same settlement must not double-count.
}
assert.deepEqual(projection.wire.view(state), { uncachedInputTokens: 60, cacheReadTokens: 200, cacheWriteTokens: 0, outputTokens: 35 })
console.log('PASS: adapter → installed Harness tokenUsage projection; two tool-boundary steps, cached input, duplicate notifications; total 295 tokens. No credentials or model calls.')
