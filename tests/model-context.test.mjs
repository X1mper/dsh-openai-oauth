import test from 'node:test'
import assert from 'node:assert/strict'
import { cachedModelContext } from '../lib/model-context.js'
const now=Date.parse('2026-10-31T12:00:00Z')
const cache={fetched_at:new Date(now).toISOString(),models:[{slug:'fixture',context_window:200000,effective_context_window_percent:95}]}
test('uses exact catalog model and effective context capacity',()=>{
 assert.equal(cachedModelContext(cache,'fixture',now),190000)
 assert.equal(cachedModelContext(cache,'fixture-alias',now),undefined)
})
test('rejects stale, future, malformed or unsafe catalog capacities',()=>{
 for(const fetched_at of ['bad',new Date(now-86400001).toISOString(),new Date(now+60001).toISOString()])assert.equal(cachedModelContext({...cache,fetched_at},'fixture',now),undefined)
 for(const context_window of [0,-1,NaN,Infinity,'200000',1.5])assert.equal(cachedModelContext({...cache,models:[{...cache.models[0],context_window}]},'fixture',now),undefined)
 for(const effective_context_window_percent of [0,101,'95'])assert.equal(cachedModelContext({...cache,models:[{...cache.models[0],effective_context_window_percent}]},'fixture',now),undefined)
})
