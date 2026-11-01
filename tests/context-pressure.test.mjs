import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateContextPressure } from '../lib/context-pressure.js'

const sample = { type: 'assistant/message', surfaceOp: 'append', data: { usage: { totalTokens: 403011, contextUsage: { inputTokens: 130000, outputTokens: 3000, resetsOnHistoryChange: true } } } }
function run(events, nodes = [{ seq: 0, tokens: 20 }]) {
  const session = { seq: events.length, eventAt: i => events[i], requestHeader: () => ({ tools: [{ name: 'x' }] }) }
  return estimateContextPressure(session, { nodes, surfaceTokens: nodes.reduce((n, x) => n + x.tokens, 0) })
}
test('uses last context sample, not aggregate billing, and adds append growth', () => {
  assert.deepEqual(run([sample, { type: 'user/message', surfaceOp: 'append' }], [{ seq: 0, tokens: 20 }, { seq: 1, tokens: 50 }]), { totalTokens: 133050, source: 'contextUsage' })
})
test('falls back for absent or malformed sample', () => {
  assert.equal(run([]).source, 'estimated')
  assert.equal(run([{ ...sample, data: { usage: { contextUsage: { inputTokens: -1, outputTokens: 5, resetsOnHistoryChange: true } } } }]).source, 'estimated')
})
test('does not reuse successful occupancy after failed or interrupted attempts', () => {
  assert.equal(run([sample, { type: 'assistant/attempt', data: { stream: [] } }]).source, 'estimated')
  assert.equal(run([{ ...sample, data: { ...sample.data, interrupted: true } }]).source, 'estimated')
  assert.equal(run([sample, { ...sample, data: { usage: { totalTokens: 900000, contextUsage: null } } }], [{ seq: 1, tokens: 20 }]).source, 'estimated')
})
test('serialized samples preserve separate billing and occupancy without mutation', () => {
  const restored = JSON.parse(JSON.stringify(sample))
  const before = JSON.stringify(restored)
  assert.equal(run([restored]).totalTokens, 133000)
  assert.equal(restored.data.usage.totalTokens, 403011)
  assert.equal(JSON.stringify(restored), before)
})
test('invalidates on replacement, offload and route or header change', () => {
  assert.equal(run([{ ...sample, surfaceOp: { op: 'replace' } }]).source, 'estimated')
  for (const event of [{ type: 'user/message', surfaceOp: { op: 'replace' } }, { type: 'image/offload' }, { type: 'request/header' }, { type: 'request/context' }]) assert.equal(run([sample, event]).source, 'estimated')
})
