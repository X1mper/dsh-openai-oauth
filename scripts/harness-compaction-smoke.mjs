// Offline installed-engine integration; fake app-server transport, real current adapter.
// DSH_RUNTIME_ROOT=/path/to/node_modules/@deepseek-ai node scripts/harness-compaction-smoke.mjs
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CodexAppServerAdapter } from '../lib/index.js'

assert.ok(process.env.DSH_RUNTIME_ROOT, 'Set DSH_RUNTIME_ROOT to installed @deepseek-ai')
const load = name => import(pathToFileURL(resolve(process.env.DSH_RUNTIME_ROOT, name, 'lib/index.js')).href)
const { Context } = await load('cordis')
const { Session } = await load('dsh-session')
const { BasicCompactionEngine } = await load('dsh-compaction-basic')
const { createUserMessage } = await load('dsh-llm')
const { isCompactCheckpointSource } = await load('dsh-compaction')
const session = new Session('offline-compaction')
const text = 'Repair widget retry logic in src/widget.ts; next run widget tests.'
const first = session.append('user/message', createUserMessage({ content: [{ type: 'text', text: (text + '\n').repeat(400) }], source: { kind: 'human' } }), { surfaceOp: 'append' })
session.append('turn/start', { turn: 1 })
const summary = ['## Primary Request and Intent', '- Repair widget retry logic.', '## Key Technical Concepts', '- Retry safety.', '## Files and Code', '- src/widget.ts: retry implementation.', '## Errors and Fixes', '- (none)', '## Pending Jobs', '- Run widget tests.', '## Current Work', '- Retry fix pending validation.', '## Next Step', '- Run widget tests.', '## Critical Context', '- Preserve retry safety.'].join('\n')
const events = [], threads = [], turns = [], calls = []
const adapter = new CodexAppServerAdapter({
  async startThread(options) { threads.push(options); return 'fake-thread-' + threads.length },
  async startTurn(options) {
    turns.push(options)
    events.push({ method: 'item/agentMessage/delta', params: { itemId: 'summary', delta: summary } },
      { method: 'turn/completed', params: { turn: { id: 'fake-turn', status: 'completed' } } })
    return 'fake-turn'
  },
  async nextEvent() { assert.ok(events.length, 'unexpected transport read'); return events.shift() },
})
const ctx = new Context()
// Deterministic fixture pricing, not a provider token-count or pressure-policy test.
ctx.tokenMeter = {
  estimateMessage(message) { return Math.ceil(JSON.stringify(message).length / 4) },
  measure(s) { return { nodes: s.surface.nodes.map(seq => {
    const tokens = this.estimateMessage(s.deriveEventMessage(s.eventAt(seq)))
    return { seq, tokens, heuristicTokens: tokens }
  }) } },
}
ctx.llm = { stream(options) {
  calls.push(options)
  assert.equal(options.purpose, 'compaction')
  assert.equal(options.maxTokens, 512)
  return adapter.stream(options)
} }
const engine = new BasicCompactionEngine(ctx, { auto: false, maxTokens: 512 })
const result = await engine.compactRegion(first.seq, first.seq, { session, options: { provider: 'openai-codex', model: 'offline-fixture' } }, AbortSignal.timeout(5000))
const log = session.snapshotEvents()
assert.deepEqual(log.filter(e => e.type.startsWith('compaction/')).map(e => e.type), ['compaction/start', 'compaction/summary', 'compaction/end'])
const checkpoint = log.find(e => e.type === 'user/message' && isCompactCheckpointSource(e.data.source))
assert.ok(checkpoint)
assert.equal(checkpoint.data.source.compactionId, result.compactionId)
assert.deepEqual(session.surface.nodes, [checkpoint.seq])
assert.match(JSON.stringify(checkpoint.data), /<compacted-summary>/)
assert.match(JSON.stringify(checkpoint.data), /src\/widget.ts/)
assert.match(JSON.stringify(checkpoint.data), /Run widget tests/)
assert.equal(calls.length, 1)
assert.equal(threads.length, 1)
assert.deepEqual(threads[0].dynamicTools ?? [], [])
assert.match(JSON.stringify(threads[0]), /isolated text-only auxiliary/)
assert.match(JSON.stringify(threads[0]), /512 tokens/)
assert.equal(log.find(e => e.type === 'compaction/summary').data.maxTokens, 512)
assert.equal(log.at(-1).data.error, undefined)
console.log(JSON.stringify({ status: 'PASS', runtime: process.env.DSH_RUNTIME_ROOT, lifecycle: log.map(e => e.type), checkpointSeq: checkpoint.seq, compactionId: result.compactionId, purpose: calls[0].purpose, maxTokens: calls[0].maxTokens, threads: threads.length, summary, note: 'Real installed engine/session, current adapter, fake app-server; deterministic fixture pricing; no network, tools, or credentials.' }, null, 2))
