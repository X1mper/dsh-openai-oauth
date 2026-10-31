// Opt-in model-backed check. Uses existing Codex login; never reads credentials.
// DSH_HISTORY_SMOKE_MODEL=gpt-6.1-sol node scripts/history-smoke.mjs
import assert from 'node:assert/strict'
import { AppServer } from '../lib/app-server.js'
import { CodexAppServerAdapter } from '../lib/index.js'
import { TRANSPORT_INPUT_BUDGET } from '../lib/history-input.js'

const server = new AppServer()
const calls = []
const startTurn = server.startTurn.bind(server)
server.startTurn = async (thread, options) => {
  const chars = options.input.reduce((n, item) => n + (item.text?.length ?? 0), 0)
  assert.ok(chars <= TRANSPORT_INPUT_BUDGET, `Unsafe input: ${chars}`)
  calls.push({ chars })
  return startTurn(thread, options)
}
const adapter = new CodexAppServerAdapter(server)
const model = process.env.DSH_HISTORY_SMOKE_MODEL
assert.ok(model, 'Set DSH_HISTORY_SMOKE_MODEL to a model available on your account')
const user = (id, text) => ({ id, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] })
const assistant = text => ({ id: 'a', role: 'assistant', source: { kind: 'model', provider: 'openai-codex', model }, content: [{ type: 'text', text }] })
const options = { provider: 'openai-codex', model, sessionId: 'isolated-large-history-smoke',
  system: 'You are testing history recovery. Answer the final request only. No tools. Replies must be very short.',
  tools: [], signal: AbortSignal.timeout(240_000) }
async function run(extra) {
  let text = ''
  for await (const c of adapter.stream({ ...options, ...extra })) {
    if (c.type === 'block-end' && c.block.type === 'text') text += c.block.text
  }
  return text
}
try {
  const messages = [
    user('old', 'The exact project identifier is violet-lighthouse-731. Preserve it.\n' + 'Historical log: worker idle; nothing changed.\n'.repeat(4900)),
    assistant('Acknowledged the project identifier.'),
    user('now', 'What is the exact project identifier from the earliest user message? Return only that identifier.'),
  ]
  await assert.rejects(run({ messages: [user('oversized', 'x'.repeat(TRANSPORT_INPUT_BUDGET + 1))] }), error => error.code === 'CONTEXT_WINDOW_EXCEEDED')
  assert.equal(calls.length, 0)
  // Exercise the actual long-history cancellation/rebuild path without tools.
  const cancel = new AbortController()
  const cancelledMessages = [...messages, user('stream', 'Count from 1 to 1000, one number per line.')]
  let partial = ''
  await assert.rejects(async () => {
    for await (const chunk of adapter.stream({ ...options, messages: cancelledMessages,
      signal: AbortSignal.any([options.signal, cancel.signal]) })) {
      if (chunk.type === 'text-delta') {
        partial += chunk.text
        cancel.abort(new Error('smoke user stop'))
      }
    }
  }, /smoke user stop/)
  assert.ok(partial)
  const rebuilt = await run({ messages: [...cancelledMessages, assistant(partial),
    user('retry', 'Stop counting. Return only the exact project identifier from the earliest user message.')] })
  assert.match(rebuilt, /violet-lighthouse-731/)
  assert.equal(calls.length, 2, 'Cancellation must rebuild without auxiliary model calls')
  const summary = await run({ purpose: 'compaction', maxTokens: 1024, messages: [
    ...messages, user('compact', 'Summarize the task and preserve the exact project identifier.'),
  ] })
  assert.match(summary, /violet-lighthouse-731/)
  const continued = await run({ messages: [user('checkpoint', summary), user('next', 'Repeat the exact project identifier only.')] })
  assert.match(continued, /violet-lighthouse-731/)
  console.log(JSON.stringify({ passed: true, model, overflowDelegated: true, cancellationRebuild: true, rebuilt, summary, continued, calls }, null, 2))
} finally { server.close() }
