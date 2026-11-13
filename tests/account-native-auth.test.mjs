import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { handleAccountsRequest } from '../lib/accounts-http.js'
import { handleOAuthRequest } from '../lib/oauth-http.js'
function request() { return Object.assign(Readable.from([]), { method:'GET', url:'/api/codex-oauth/accounts', headers:{host:'harness.example',origin:'https://harness.example'},socket:{remoteAddress:'192.0.2.1'} }) }
function response() { return {writeHead(status){this.status=status},end(body){this.body=JSON.parse(body)}} }
test('remote account controls delegate admission to native Harness gate', async()=>{
 const runtime={accounts:{list:()=>[{id:'default',name:'Personal',provider:'openai-codex'}]}}
 for(const rejection of [undefined,401,403]) {
  const req=request(),res=response();let calls=0
  await handleAccountsRequest(runtime,req,res,r=>{assert.equal(r,req);calls++;return rejection})
  assert.equal(calls,1);assert.equal(res.status,rejection??200)
 }
})
test('nested account status retains native gate and rejects unauthenticated access', async()=>{
 let touched=0
 const runtime={accounts:{get:()=>({id:'default'})},accountServer(){return {async account(){touched++;return null}}}}
 for(const rejection of [undefined,401,403]){
  const req=request();req.url+='/default';const res=response()
  await handleAccountsRequest(runtime,req,res,()=>rejection)
  assert.equal(res.status,rejection??200)
 }
 assert.equal(touched,1)
})
test('legacy OAuth also requires native admission on remote UI',async()=>{
 for(const rejection of [undefined,401,403]){
  const req=request();req.url='/api/codex-oauth';const res=response()
  await handleOAuthRequest({async account(){return null}},req,res,()=>rejection)
  assert.equal(res.status,rejection??200)
 }
})
