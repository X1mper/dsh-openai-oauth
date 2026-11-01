import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexUsageTracker } from '../lib/usage.js'

function total(inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens = 0, cacheWriteInputTokens = 0) {
  return { inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens, cacheWriteInputTokens, totalTokens: inputTokens + outputTokens }
}
const update = (tracker, value) => tracker.update({ total: value, last: total(999, 0, 999) })

test('maps inclusive Codex prompt tokens to disjoint Harness counters', () => {
  const tracker = new CodexUsageTracker()
  update(tracker, total(100, 60, 20, 8, 10))
  assert.deepEqual(tracker.take(), { inputTokens: 30, cacheReadTokens: 60, cacheWriteTokens: 10, outputTokens: 20, reasoningTokens: 8, totalTokens: 120 })
  assert.equal(tracker.take(), undefined)
})

test('reports cumulative thread deltas, not last-response or repeated thread totals', () => {
  const tracker = new CodexUsageTracker()
  update(tracker, total(100, 60, 20, 8))
  assert.equal(tracker.take().totalTokens, 120)
  update(tracker, total(100, 60, 20, 8))
  assert.equal(tracker.take(), undefined)
  update(tracker, total(180, 110, 35, 12))
  assert.deepEqual(tracker.take(), { inputTokens: 30, cacheReadTokens: 50, cacheWriteTokens: 0, outputTokens: 15, reasoningTokens: 4, totalTokens: 95 })
})

test('coalesces multiple response notifications into one call usage', () => {
  const tracker = new CodexUsageTracker()
  update(tracker, total(20, 0, 3))
  update(tracker, total(40, 10, 7, 2))
  assert.equal(tracker.take().totalTokens, 47)
})

test('does not invent usage when Codex omitted it or only supplied last', () => {
  const tracker = new CodexUsageTracker()
  for (const value of [undefined, null, {}, { last: total(5, 0, 1) }]) tracker.update(value)
  assert.equal(tracker.take(), undefined)
})

test('accepts the protocol default for an omitted cache-write counter', () => {
  const tracker = new CodexUsageTracker()
  const value = total(10, 4, 2)
  delete value.cacheWriteInputTokens
  update(tracker, value)
  assert.equal(tracker.take().cacheWriteTokens, 0)
})

for (const patch of [{ inputTokens: -1 }, { outputTokens: 0.5 }, { totalTokens: Number.MAX_SAFE_INTEGER + 1 }, { cachedInputTokens: 500 }, { reasoningOutputTokens: 500 }, { totalTokens: 999 }, { inputTokens: '100' }]) {
  test(`ignores malformed usage ${JSON.stringify(patch)}`, () => {
    const tracker = new CodexUsageTracker()
    update(tracker, { ...total(100, 30, 10, 2), ...patch })
    assert.equal(tracker.take(), undefined)
    update(tracker, total(100, 30, 10, 2))
    assert.equal(tracker.take().totalTokens, 110)
  })
}

test('ignores regressing/stale totals rather than emitting negative or duplicated usage', () => {
  const tracker = new CodexUsageTracker()
  update(tracker, total(100, 30, 10))
  tracker.take()
  update(tracker, total(50, 10, 5))
  assert.equal(tracker.take(), undefined)
  update(tracker, total(120, 40, 15))
  assert.equal(tracker.take().totalTokens, 25)
})

test('separates three billed native responses from the final context occupancy', () => {
  const tracker = new CodexUsageTracker()
  tracker.update({ total: total(120000, 100000, 100), last: total(120000, 100000, 100) })
  tracker.update({ total: total(242000, 210000, 300), last: total(122000, 110000, 200) })
  tracker.update({ total: total(366000, 330000, 600), last: total(124000, 120000, 300) })
  assert.equal(tracker.take().totalTokens, 366600)
  assert.deepEqual(tracker.contextUsage(), { inputTokens: 124000, outputTokens: 300, resetsOnHistoryChange: true })
  assert.equal(tracker.take(), undefined)
})

test('context samples cannot be replaced by duplicate or stale notifications', () => {
  const tracker = new CodexUsageTracker()
  const value = total(100, 40, 10)
  tracker.update({ total: value, last: value })
  tracker.update({ total: value, last: total(9, 0, 1) })
  tracker.update({ total: total(50, 10, 5), last: total(50, 10, 5) })
  assert.deepEqual(tracker.contextUsage(), { inputTokens: 100, outputTokens: 10, resetsOnHistoryChange: true })
  const detached = tracker.contextUsage()
  detached.inputTokens = 9999
  assert.equal(tracker.contextUsage().inputTokens, 100)
})

test('missing or inconsistent last samples explicitly invalidate context, not billing', () => {
  for (const last of [undefined, {}, total(9999, 0, 1), { ...total(10, 0, 1), outputTokens: -1 }]) {
    const tracker = new CodexUsageTracker()
    tracker.update({ total: total(100, 0, 10), last: total(100, 0, 10) })
    tracker.take()
    tracker.update({ total: total(200, 0, 20), last })
    assert.equal(tracker.contextUsage(), null)
    assert.equal(tracker.take().totalTokens, 110)
  }
})

test('billing restore does not restore a stale context sample', () => {
  const tracker = new CodexUsageTracker()
  tracker.update({ total: total(100, 40, 10), last: total(100, 40, 10) })
  assert.equal(tracker.restore(tracker.checkpoint()), true)
  assert.equal(tracker.contextUsage(), null)
  assert.equal(tracker.take(), undefined)
  tracker.update({ total: total(220, 90, 30), last: total(120, 50, 20) })
  assert.deepEqual(tracker.contextUsage(), { inputTokens: 120, outputTokens: 20, resetsOnHistoryChange: true })
  assert.equal(tracker.take().totalTokens, 140)
})

test('keeps independent threads separate', () => {
  const one = new CodexUsageTracker(), two = new CodexUsageTracker()
  update(one, total(100, 10, 10))
  update(two, total(30, 5, 2))
  assert.equal(one.take().totalTokens, 110)
  assert.equal(two.take().totalTokens, 32)
})
