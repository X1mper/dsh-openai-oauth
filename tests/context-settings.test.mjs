import test from 'node:test'
import assert from 'node:assert/strict'
import Schema from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
// Exercise the shipped native model without importing unrelated browser widgets.
const primitives = readFileSync(new URL('../node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js', import.meta.url), 'utf8')
const modelSource = primitives.split('//#region lib/types/settings-form/form-model.js')[1].split('//#endregion')[0]
const { SettingsFormModel } = await import('data:text/javascript;base64,' + Buffer.from(modelSource + '\nexport { SettingsFormModel }').toString('base64'))
import { CodexCompactionEngine } from '../lib/codex-compaction.js'
import { Config } from '../lib/context-policy.js'
import { hasSettingsFields, isCodexCapSchema, selectSettingsId, capField } from '../lib/context-settings-discovery.js'

test('directory React callbacks preserve the native mirror receiver', () => {
  const client = readFileSync(new URL('../src/client.tsx', import.meta.url), 'utf8')
  const callbacks = client.slice(client.indexOf('  const subscribeDirectory ='), client.indexOf('  const subscribeLocale ='))
    .replace('(listener: () => void)', '(listener)')
  const directory = {
    snapshot: { status: 'ready' },
    getSnapshot() { return this.snapshot },
    subscribe(listener) { assert.equal(this, directory); listener(); return () => {} },
  }
  const { subscribeDirectory, getDirectorySnapshot } = new Function('directory', callbacks + '\nreturn { subscribeDirectory, getDirectorySnapshot }')(directory)
  assert.equal(getDirectorySnapshot(), directory.snapshot)
  let notified = false
  assert.equal(typeof subscribeDirectory(() => { notified = true }), 'function')
  assert.equal(notified, true)
  assert.match(client, /useSyncExternalStore\(subscribeDirectory, getDirectorySnapshot\)/)
})

test('discovery matches only distinctive root schema fields', () => {
  assert.equal(hasSettingsFields(CodexCompactionEngine.Config.toJSON(), ['thresholdTokens', 'thresholdRatio', 'retainRatio', 'retainTokens']), true)
  assert.equal(hasSettingsFields(Config.toJSON(), ['idleMinutes', 'minHistoryTokens']), true)
  assert.equal(hasSettingsFields(Schema.object({ nested: CodexCompactionEngine.Config }).toJSON(), ['thresholdTokens']), false)
  assert.equal(hasSettingsFields(null, ['thresholdTokens']), false)
})
test('backend discovery accepts projected cap marker but rejects generic or nested caps', () => {
  const field = Schema.number().description('Codex pressure compaction token cap')
  assert.equal(isCodexCapSchema(Schema.object({ thresholdTokens: field }).toJSON()), true)
  assert.equal(isCodexCapSchema(Schema.object({ thresholdTokens: Schema.number() }).toJSON()), false)
  assert.equal(isCodexCapSchema(Schema.object({ nested: Schema.object({ thresholdTokens: field }) }).toJSON()), false)
  assert.equal(isCodexCapSchema(Schema.object({ thresholdTokens: Schema.string().description('Codex pressure compaction token cap') }).toJSON()), false)
})
test('selection requires explicit choice among multiple live namespaces', () => {
  const items = [{ ns: 'scoped' }, { ns: 'other' }]
  assert.equal(selectSettingsId(items, ''), undefined)
  assert.equal(selectSettingsId(items, 'inactive-root'), undefined)
  assert.equal(selectSettingsId(items, 'scoped'), 'scoped')
  assert.equal(selectSettingsId(items.slice(0, 1), ''), 'scoped')
  assert.equal(selectSettingsId([], 'scoped'), undefined)
})
test('optional cap accepts positive safe integers and clears blank drafts', () => {
  assert.equal(capField.format(undefined), '')
  assert.deepEqual(capField.parse(' '), { kind: 'clear' })
  assert.deepEqual(capField.parse('200000'), { kind: 'set', value: 200000 })
  for (const text of ['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) assert.equal(capField.parse(text), undefined)
})
test('native form saves cap only and resets by unset, preserving inherited base', async () => {
  const writes = []
  const snapshot = { status: 'ready', writable: true, revision: 4, value: { thresholdTokens: 200000 }, base: { thresholdTokens: 200000 }, user: {} }
  const form = new SettingsFormModel({ getSnapshot: () => snapshot, subscribe: () => () => {}, mutate: async (ops, revision) => {
    writes.push({ ops, revision })
    for (const op of ops) {
      if (op.op === 'set') snapshot.user.thresholdTokens = op.value
      else delete snapshot.user.thresholdTokens
    }
    snapshot.value = { ...snapshot.base, ...snapshot.user }
    return true
  } }, [capField])
  form.actions().edit('thresholdTokens', '180000')
  form.actions().save()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(writes[0], { ops: [{ op: 'set', path: ['thresholdTokens'], value: 180000 }], revision: 4 })
  form.actions().edit('thresholdTokens', '')
  form.actions().save()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(writes[1].ops, [{ op: 'unset', path: ['thresholdTokens'] }])
  assert.equal(snapshot.base.thresholdTokens, 200000)
  form.actions().edit('thresholdTokens', '180000')
  form.actions().save()
  await new Promise(resolve => setImmediate(resolve))
  form.actions().resetField('thresholdTokens')
  form.actions().save()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(writes[3].ops, [{ op: 'unset', path: ['thresholdTokens'] }])
  form.actions().edit('thresholdTokens', '0')
  assert.equal(form.shell().invalid, true)
  form.actions().save()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(writes.length, 4)
  form.dispose()
})
