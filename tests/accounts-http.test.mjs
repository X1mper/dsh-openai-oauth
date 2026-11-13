import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AccountRegistry } from '../lib/accounts.js'
import { handleAccountsRequest } from '../lib/accounts-http.js'
test('account APIs isolate status and mutations, reject unsafe and cross-origin controls', async () => {
 const root = await mkdtemp(join(tmpdir(),'codex-http-'))
 try {
 const accounts = new AccountRegistry(root)
 const calls = []
 const runtime = {accounts, changed(){}, accountServer(id) { calls.push(id); return {async account(){return null}, async models(){return []}, async logout(){},async startChatGptLogin(){return {authUrl:'https://example.com',loginId:id}}} }}
 async function request(method,path,data,origin='http://localhost') {
  const req = Readable.from(data ? [JSON.stringify(data)] : [])
  Object.assign(req,{method,url:'/api/codex-oauth/accounts'+path,headers:{host:'localhost',origin},socket:{remoteAddress:'127.0.0.1'}})
  const res = {status:0,writeHead(s){this.status=s},end(s){this.body=JSON.parse(s)}}
  await handleAccountsRequest(runtime,req,res);return res
 }
 const created=await request('POST','',{name:'Work'})
 assert.equal(created.status,201); const id=created.body.account.id
 assert.equal((await request('GET','')).body.accounts.length,2)
 assert.equal((await request('GET','/'+id)).body.authenticated,false)
 assert.deepEqual(calls,[id])
 assert.equal((await request('POST','/'+id+'/login')).body.loginId,id)
 assert.equal((await request('PATCH','/'+id,{name:'Office'})).body.account.name,'Office')
 assert.equal((await request('GET','/bad')).status,400)
 assert.equal((await request('DELETE','/'+id,undefined,'https://evil.example')).status,403)
 assert.equal((await request('DELETE','/'+id)).body.credentialsPreserved,true)
 assert.equal((await request('DELETE','/default')).status,400)
 } finally {await rm(root,{recursive:true,force:true})}
})
