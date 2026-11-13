import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AccountRegistry, accountHome, accountProvider } from '../lib/accounts.js'
test('named registry persists stable isolated routes and preserves credentials on removal', async () => {
 const root = await mkdtemp(join(tmpdir(), 'codex-accounts-'))
 try {
 const registry = new AccountRegistry(root); await registry.load()
 assert.equal(accountHome('default', root), root)
 assert.equal(registry.list()[0].provider, 'openai-codex-default')
 assert.equal(registry.resolveProvider('openai-codex'), 'default')
 const [a,b] = await Promise.all([registry.create('Personal'), registry.create('Work')])
 assert.notEqual(a.id,b.id); assert.notEqual(a.provider,b.provider)
 const home = accountHome(a.id, root); await mkdir(home, {recursive:true}); await writeFile(join(home,'auth.json'),'sentinel')
 await registry.rename(a.id,'Renamed')
 const loaded = new AccountRegistry(root); await loaded.load()
 assert.equal(loaded.get(a.id).name,'Renamed')
 await loaded.delete(a.id)
 assert.equal(await readFile(join(home,'auth.json'),'utf8'),'sentinel')
 assert.throws(() => loaded.get(a.id))
 await assert.rejects(loaded.delete('default'))
 assert.throws(() => accountHome('../escape', root))
 assert.throws(() => accountProvider('DEFAULT'))
 await assert.rejects(async () => loaded.create(' '))
 } finally { await rm(root,{recursive:true,force:true}) }
})
