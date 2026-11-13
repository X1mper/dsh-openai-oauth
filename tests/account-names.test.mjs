import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AccountRegistry, accountSlug, accountProvider, accountHome } from '../lib/accounts.js'
import { accountIdForProvider } from '../lib/account-ui.js'
import { routeAccountId } from '../lib/account-route.js'
import { isCodexProvider } from '../lib/codex-route.js'
test('Russian transliteration, collisions, rename aliases and strict routing', async () => {
 const home = await mkdtemp(join(tmpdir(), 'named-codex-'))
 try {
  const r = new AccountRegistry(home)
  assert.equal(accountSlug('Рабочий'), 'rabochiy')
  const a = await r.create('Рабочий'), b = await r.create('Рабочий'), c = await r.create('Default')
  assert.equal(a.provider, 'openai-codex-rabochiy')
  assert.equal(b.provider, 'openai-codex-rabochiy-2')
  assert.equal(c.provider, 'openai-codex-default-2')
  const uuidName = await r.create('12345678-1234-4123-8123-123456789abc')
  assert.equal(uuidName.provider, 'openai-codex-account-12345678-1234-4123-8123-123456789abc')
  const latin = await r.create('Rabochiy')
  assert.equal(latin.provider, 'openai-codex-rabochiy-3')
  const renamed = await r.rename(a.id, 'Личный')
  assert.equal(renamed.provider, 'openai-codex-lichnyy')
  assert.equal(r.resolveProvider(a.provider), a.id)
  assert.equal(r.resolveProvider(accountProvider(a.id)), a.id)
  assert.equal(routeAccountId(a.provider, p => r.resolveProvider(p)), a.id)
  assert.equal(accountIdForProvider(a.provider, r.list()), a.id)
  assert.equal(accountIdForProvider(a.provider), undefined)
  assert.equal(isCodexProvider(a.provider), true)
  assert.throws(() => r.resolveProvider('openai-codex-missing'))
  assert.throws(() => routeAccountId('openai-codex-missing', p => r.resolveProvider(p)))
  const loaded = new AccountRegistry(home); await loaded.load()
  assert.equal(loaded.resolveProvider(a.provider), a.id)
  assert.equal(accountHome(a.id, home), join(home, 'accounts', a.id))
 } finally { await rm(home, { recursive:true, force:true }) }
})
test('deleted account routes remain reserved across recreation, rename and restart', async () => {
 const home = await mkdtemp(join(tmpdir(), 'named-codex-'))
 try {
  const r = new AccountRegistry(home)
  const a = await r.create('Рабочий')
  const renamed = await r.rename(a.id, 'Personal')
  await r.delete(a.id)
  assert.equal(r.list().length, 1)
  assert.throws(() => r.get(a.id))
  for (const route of [a.provider, renamed.provider, accountProvider(a.id)]) assert.throws(() => r.resolveProvider(route))
  const b = await r.create('Рабочий')
  assert.equal(b.provider, 'openai-codex-rabochiy-2')
  const loaded = new AccountRegistry(home); await loaded.load()
  for (const route of [a.provider, renamed.provider, accountProvider(a.id)]) assert.throws(() => loaded.resolveProvider(route))
  assert.equal(loaded.list().some(e => e.id === a.id), false)
  const c = await loaded.create('Personal')
  assert.equal(c.provider, 'openai-codex-personal-2')
  const bRenamed = await loaded.rename(b.id, 'Personal')
  assert.equal(bRenamed.provider, 'openai-codex-personal-3')
  const reloaded = new AccountRegistry(home); await reloaded.load()
  assert.equal(reloaded.resolveProvider(b.provider), b.id)
  assert.throws(() => reloaded.resolveProvider(renamed.provider))
 } finally { await rm(home, {recursive:true,force:true}) }
})
test('legacy registry migrates UUID and default routes without losing identity', async () => {
 const home = await mkdtemp(join(tmpdir(), 'named-codex-'))
 try {
  const id = '12345678-1234-4123-8123-123456789abc'
  await writeFile(join(home,'accounts.json'), JSON.stringify([{id:'default',name:'Рабочий'}, {id,name:'Рабочий'}]))
  const r = new AccountRegistry(home); await r.load()
  assert.equal(r.get('default').provider, 'openai-codex-rabochiy')
  assert.equal(r.get(id).provider, 'openai-codex-rabochiy-2')
  assert.equal(r.resolveProvider('openai-codex'), 'default')
  assert.equal(r.resolveProvider(accountProvider(id)), id)
 } finally { await rm(home, {recursive:true,force:true}) }
})
