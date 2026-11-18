import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commonChildModels } from '../lib/subagent-catalog.js'
import { childOptions, Config } from '../lib/component-subagents.js'

const a = 'default'
const b = '12345678-1234-4234-8234-123456789abc'
function fixture() {
  const entries = [{ id: a }, { id: b }]
  const rows = (efforts) => [{ model: 'm', supportedReasoningEfforts: efforts.map(reasoningEffort => ({ reasoningEffort })) }]
  const servers = new Map([[a, { account: async () => ({ type: 'chatgpt' }), models: async () => rows(['low', 'high']) }], [b, { account: async () => ({ type: 'chatgpt' }), models: async () => rows(['high']) }]])
  return { accounts: {
    list: () => entries,
    get: id => { if (!entries.some(e => e.id === id)) throw Error('deleted'); return { id } },
    resolveProvider: route => { const id = route === 'openai-codex' || route === 'openai-codex-default' ? a : route === 'openai-codex-work' || route === 'openai-codex-' + b ? b : undefined; if (!id || !entries.some(e => e.id === id)) throw Error('Unknown route'); return id },
  }, accountServer: id => servers.get(id), entries, servers }
}
test('catalog intersects models and efforts, excludes unauthenticated, fails closed', async () => {
  const r = fixture()
  assert.deepEqual(await commonChildModels(r), [{ model: 'm', reasoningEfforts: ['high'] }])
  r.servers.get(b).account = async () => null
  assert.deepEqual((await commonChildModels(r))[0].reasoningEfforts, ['low', 'high'])
  r.servers.get(b).account = async () => { throw Error('account error') }
  await assert.rejects(commonChildModels(r), /account error/)
  r.servers.get(b).account = async () => ({ type: 'chatgpt' })
  r.servers.get(b).models = async () => []
  assert.deepEqual(await commonChildModels(r), [])
  await assert.rejects(childOptions(r, { provider: 'openai-codex', model: 'm' }), /common/)
})
test('concurrent parent snapshots, nested and restored child retain concrete account; role effort retained', async () => {
  const r = fixture()
  const parentA = { provider: 'openai-codex-default', model: 'm', reasoningEffort: 'low' }
  const parentB = { provider: 'openai-codex-work', model: 'm' }
  const pendingA = childOptions(r, { ...parentA }, { model: 'm', reasoningEffort: 'high' })
  const pendingB = childOptions(r, { ...parentB }, { model: 'm', reasoningEffort: 'high' })
  parentA.provider = 'openai-codex-work'
  const [ca, cb] = await Promise.all([pendingA, pendingB])
  assert.equal(ca.provider, 'openai-codex')
  assert.equal(cb.provider, 'openai-codex-' + b)
  assert.equal(ca.reasoningEffort, 'high')
  assert.deepEqual(await childOptions(r, JSON.parse(JSON.stringify(cb))), cb)
  r.entries.pop()
  await assert.rejects(childOptions(r, cb), /Unknown/)
})
test('no global auto route, unsupported effort, cancellation, strict role config', async () => {
  const r = fixture()
  await assert.rejects(childOptions(r, { provider: 'other', model: 'm' }), /concrete/)
  await assert.rejects(childOptions(r, { provider: 'openai-codex', model: 'm' }, { reasoningEffort: 'low' }), /effort/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(childOptions(r, { provider: 'openai-codex', model: 'm' }, {}, {}, controller.signal), { name: 'AbortError' })
  assert.equal(Config.safeParse({ agentOptions: { provider: 'openai-codex' } }).success, false)
})
