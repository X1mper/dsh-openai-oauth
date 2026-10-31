import assert from 'node:assert/strict'
import test from 'node:test'
import { codexToolSchema } from '../lib/tool-schema.js'

test('Offscreen coordinate tuple is normalized without mutating the Harness schema', () => {
  const original = { type: 'object', properties: { coordinate: {
    type: 'array', description: '(x, y)', items: [{ type: 'number' }, { type: 'number' }],
  } }, required: ['action'], additionalProperties: false }
  const before = structuredClone(original)
  const converted = codexToolSchema(original)
  assert.deepEqual(converted.properties.coordinate.items, { type: 'number' })
  assert.match(converted.properties.coordinate.description, /2 entries/)
  assert.deepEqual(converted.required, ['action'])
  assert.equal(converted.additionalProperties, false)
  assert.deepEqual(original, before)
})

test('nested tuple conversion preserves constraints and leaves example data untouched', () => {
  const value = { anyOf: [{ type: 'array', minItems: 2, maxItems: 2, items: [{ type: 'integer' }, { type: 'integer' }] }],
    default: { items: [{ type: 'number' }] } }
  const converted = codexToolSchema(value)
  assert.deepEqual(converted.anyOf[0].items, { type: 'integer' })
  assert.equal(converted.anyOf[0].maxItems, 2)
  assert.deepEqual(converted.default, value.default)
  assert.throws(() => codexToolSchema({ items: [{ type: 'string' }, { type: 'number' }] }), /heterogeneous/)
})
