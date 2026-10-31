// Opt-in: uses the existing isolated ChatGPT sign-in; no workspace tools.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { AppServer } from '../lib/app-server.js'
import { CodexAppServerAdapter } from '../lib/index.js'

let server = new AppServer()
const model = process.env.DSH_SMOKE_MODEL || 'gpt-6.1-sol'
const options = { provider: 'openai-codex', model, sessionId: `lifecycle-smoke-${Date.now()}`,
  reasoningEffort: 'low', signal: AbortSignal.timeout(90_000),
  tools: [{ name: 'echo', description: 'Return a harmless fixture string.', parameters: { type: 'object', properties: {}, additionalProperties: false } }],
  system: 'Follow the user. Use echo exactly once when requested. Do not use other tools.' }
const messages = [{ id: 'first', role: 'user', content: [{ type: 'text', text: 'Call echo once now, then answer briefly.' }] }]
const record = chunks => ({ role: 'assistant', content: chunks.filter(c => c.type === 'block-end').map(c => c.block),
  source: { kind: 'model', provider: options.provider, model, replayState: chunks.findLast(c => c.type === 'finish').replayState } })
let starts = 0, steers = 0, resumes = 0
function instrument() {
for (const [name, count] of [['startThread', () => starts++], ['steerTurn', () => steers++], ['resumeCompletedThread', () => resumes++]]) {
  const original = server[name].bind(server)
  server[name] = async (...args) => { count(); return original(...args) }
}
}
instrument()
try {
  const adapter = new CodexAppServerAdapter(server)
  const first = await Array.fromAsync(adapter.stream({ ...options, messages }))
  assert.equal(first.at(-1).reason.kind, 'tool-calls')
  const call = first.find(c => c.type === 'block-end' && c.block.type === 'tool-call').block
  messages.push(record(first), { role: 'tool', toolCallId: call.id, content: [{ type: 'text', text: 'fixture complete' }] },
    { id: 'steer', role: 'user', content: [{ type: 'text', text: 'New instruction: respond with exactly STEER_OK_731 and do not call tools again.' }] })
  const second = await Array.fromAsync(adapter.stream({ ...options, messages }))
  assert.equal(second.at(-1).reason.kind, 'stop')
  assert.match(record(second).content.filter(b => b.type === 'text').map(b => b.text).join(''), /STEER_OK_731/)
  assert.equal(starts, 1); assert.equal(steers, 1)
  messages.push(record(second), { id: 'resume', role: 'user', content: [{ type: 'text', text: 'Repeat the exact code from your previous answer. No tools.' }] })
  // Restart the actual process as well as the adapter; no live RPC survives.
  const exited = once(server.child, 'exit')
  server.close()
  await exited
  server = new AppServer()
  instrument()
  const third = await Array.fromAsync(new CodexAppServerAdapter(server).stream({ ...options, messages }))
  assert.equal(third.at(-1).reason.kind, 'stop')
  assert.match(record(third).content.filter(b => b.type === 'text').map(b => b.text).join(''), /STEER_OK_731/)
  assert.equal(starts, 1); assert.equal(resumes, 1)
  assert.ok(third.some(c => c.type === 'usage' && c.usage.totalTokens > 0))
  console.log(JSON.stringify({ status: 'PASS', model, starts, steers, resumes, threadId: third.at(-1).replayState.threadId }))
} finally { server.close() }
