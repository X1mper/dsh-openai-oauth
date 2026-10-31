import assert from 'node:assert/strict'
import test from 'node:test'
import { boundedInput, splitText, INPUT_BUDGET, HISTORY_CHUNK, SUMMARY_BUDGET } from '../lib/history-input.js'

test('short input stays byte-for-byte unchanged without model work', async () => {
  const text = 'Привет 😀\\n "literal"'
  assert.equal(await boundedInput(text, () => { throw Error('unexpected summary') }), text)
})
test('1,785,217 characters: every earlier character is summarized once and recent suffix stays verbatim', async () => {
  const base = 'BEGIN ' + 'я😀x'.repeat(446295) + ' FINAL REQUEST'
  const text = base + 'я'.repeat(1_785_217 - base.length)
  assert.equal(text.length, 1_785_217)
  const seen = []
  const result = await boundedInput(text, async (part, position) => {
    assert.ok(part.length <= HISTORY_CHUNK)
    assert.ok(position.includes('fragment'))
    seen.push(part)
    return 'Earlier requirement; tool failed, not completed.'
  })
  const suffix = result.slice(result.indexOf('[Verbatim most recent input suffix'))
  const tail = suffix.slice(suffix.indexOf('\n\n') + 2)
  assert.equal(seen.join('') + tail, text)
  assert.ok(result.length <= INPUT_BUDGET)
  assert.ok(result.endsWith(text.slice(-50)))
  assert.match(result, /semantically summarized, NOT replayed verbatim/)
  for (const part of seen) {
    assert.doesNotMatch(part, /^[\uDC00-\uDFFF]/)
    assert.doesNotMatch(part, /[\uD800-\uDBFF]$/)
  }
})
test('hierarchical reduction stays bounded for very large histories', async () => {
  const positions = []
  const result = await boundedInput('x'.repeat(3_000_000), async (_, position) => {
    positions.push(position)
    return 's'.repeat(12_000)
  })
  assert.ok(positions.some(p => p.startsWith('level 2')))
  assert.ok(result.length <= INPUT_BUDGET)
})
test('invalid summary fails closed, never silently truncates', async () => {
  for (const summary of ['', 'x'.repeat(SUMMARY_BUDGET + 1)]) {
    await assert.rejects(boundedInput('x'.repeat(INPUT_BUDGET + 1), async () => summary), /summary was empty or exceeded/)
  }
})
test('cancellation prevents further summary calls', async () => {
  const controller = new AbortController(); let calls = 0
  await assert.rejects(boundedInput('x'.repeat(500_000), async () => {
    calls++; controller.abort(new Error('cancelled')); return 'ok'
  }, controller.signal), /cancelled/)
  assert.equal(calls, 1)
})
test('Unicode splitting is lossless at surrogate boundaries', () => {
  const text = '😀'.repeat(200)
  const parts = splitText(text, 7)
  assert.equal(parts.join(''), text)
  assert.ok(parts.every(p => p.length <= 7))
})
