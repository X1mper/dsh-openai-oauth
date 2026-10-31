// Offline regression: use the installed host's Session class and record writer.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const runtime = process.env.DSH_RUNTIME_ROOT
assert.ok(runtime, 'Set DSH_RUNTIME_ROOT to installed node_modules/@deepseek-ai')
const root = await mkdtemp(join(tmpdir(), 'dsh-record-restore-'))
try {
  await mkdir(join(root, 'node_modules'))
  await symlink(resolve(runtime), join(root, 'node_modules/@deepseek-ai'))
  await cp('lib/session-records.js', join(root, 'session-records.mjs'))
  const { Session, KNOWN_SESSION_EVENT_TYPES } = await import(pathToFileURL(join(resolve(runtime), 'dsh-session/lib/index.js')))
  const { initializeSessionRecords, recordUsage, USAGE_RECORD_TYPES } = await import(pathToFileURL(join(root, 'session-records.mjs')))
  await initializeSessionRecords()
  const session = Session.create('record-smoke')
  session.append('user/message', { role: 'user', id: 'fixture-message', source: { kind: 'user' }, content: [{ type: 'text', text: 'Preserve this conversation.' }] }, { surfaceOp: 'append' })
  for (const kind of ['image', 'search', 'fetch']) recordUsage(session, kind, { completed: true, usage: kind === 'image' ? undefined : { totalTokens: 7 } })
  const persisted = JSON.parse(JSON.stringify(session.snapshotEvents()))
  const records = persisted.filter(e => Object.values(USAGE_RECORD_TYPES).includes(e.type))
  assert.equal(records.length, 3)
  for (const event of records) {
    assert.equal(event.ignorable, true)
    assert.equal(KNOWN_SESSION_EVENT_TYPES.has(event.type), false)
  }
  const restored = Session.create('record-smoke', persisted)
  assert.deepEqual(restored.deriveMessages(), session.deriveMessages())
  assert.deepEqual(restored.snapshotEvents().slice(0, persisted.length), persisted)
  assert.equal(restored.snapshotEvents().at(-1).type, 'session/end-seed')
  assert.equal(restored.deriveMessages().length, 1)
  console.log(JSON.stringify({ status: 'PASS', ignorableRecords: records.length, restoredMessages: restored.deriveMessages().length }))
} finally { await rm(root, { recursive: true, force: true }) }
