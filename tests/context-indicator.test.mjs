import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { Session } from '@deepseek-ai/dsh-session'
import { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm/message'
import { estimateMessage } from '@deepseek-ai/dsh-token-meter/estimate'
import { codexContextProjection as p, apply } from '../lib/context-indicator.js'

const route={provider:'openai-codex',model:'test'}
function fixture(){
 const session=Session.create('indicator-test')
 let state=p.init()
 const append=(type,data,meta)=>{const e=session.append(type,data,meta);state=p.apply(state,e);p.stateSchema.parse(state);return e}
 const view=()=>p.wire.view(state)
 const user=text=>append('user/message',createUserMessage({source:{kind:'user'},content:[{type:'text',text}]}),{surfaceOp:'append'})
 const answer=(usage,extra={})=>append('assistant/message',{turn:1,step:1,stream:[],message:createAssistantMessage({source:route,content:[{type:'text',text:'Answer'}]}),usage,...extra},{surfaceOp:'append'})
 append('request/header',{header:{config:route},reason:'initial'})
 append('request/context',{...route,contextWindow:10000})
 return {session,append,user,answer,view,state:()=>state}
}
const usage={inputTokens:778,cacheReadTokens:401920,outputTokens:313,totalTokens:403011,contextUsage:{inputTokens:2000,outputTokens:313,resetsOnHistoryChange:true}}
test('indicator reads independent occupancy and estimates only subsequent growth',()=>{
 const h=fixture();h.user('secret text')
 h.answer(usage)
 assert.equal(h.view().totalTokens,2313)
 assert.equal(h.view().capacity,10000)
 assert.equal(h.view().source,'contextUsage')
 const e=h.user('new work')
 assert.equal(h.view().totalTokens,2313+estimateMessage(e.data))
 assert.equal(JSON.stringify(h.state()).includes('secret text'),false)
 assert.equal(h.session.eventAt(3).data.usage.totalTokens,403011)
})
test('replacement invalidates sample and prices smaller current surface',()=>{
 const h=fixture();const a=h.user('long '.repeat(1000));const b=h.answer(usage)
 h.append('user/message',createUserMessage({source:{kind:'compact-checkpoint',compactionId:'test'},content:[{type:'text',text:'summary'}]}),{surfaceOp:{op:'replace',startSeq:a.seq,endSeq:b.seq},sourceEventSeqs:[a.seq,b.seq]})
 assert.equal(h.view().source,'estimated');assert.ok(h.view().totalTokens<100)
 assert.equal(h.state().nodes.length,1)
})
test('failed calls and offload do not reuse stale occupancy',()=>{
 const h=fixture();h.user('task');h.answer(usage,{interrupted:true})
 assert.equal(h.view().source,'estimated')
 h.answer(usage)
 h.append('assistant/attempt',{turn:1,step:2,stream:[]})
 assert.equal(h.view().source,'estimated')
 const state=p.apply(h.state(),{type:'image/offload',seq:99,data:{}})
 assert.equal(state.view.source,'unavailable');assert.equal(state.view.totalTokens,null)
})
test('route changes never combine old capacity and new route usage',()=>{
 const h=fixture();h.answer(usage)
 h.append('request/header',{header:{config:{...route,model:'new'}},reason:'change'})
 assert.equal(h.view().capacity,null);assert.equal(h.view().source,'estimated')
 h.append('request/context',{...route,model:'new',contextWindow:20000})
 assert.equal(h.view().capacity,20000)
 h.append('request/header',{header:{config:{provider:'other',model:'x'}},reason:'change'})
 assert.equal(h.view(),null)
})
test('request context may precede the new header without mixing capacities',()=>{
 const h=fixture();h.answer(usage)
 h.append('request/context',{...route,model:'new',contextWindow:20000})
 assert.equal(h.view().capacity,null)
 h.append('request/header',{header:{config:{...route,model:'new'}},reason:'change'})
 assert.equal(h.view().capacity,20000)
 assert.equal(h.view().source,'estimated')
})
test('image-related unrelated log records do not invalidate the sample',()=>{
 const h=fixture();h.answer(usage)
 assert.equal(p.apply(h.state(),{type:'plugin:image/generated',seq:99,data:{}}),h.state())
})
test('projection registers and replays real serialized session with text-free numeric surface state',()=>{
 const h=fixture();h.user('task');h.answer(usage)
 const seed=Array.from({length:h.session.seq},(_,i)=>h.session.eventAt(i))
 const replay=Session.create('indicator-replay',JSON.parse(JSON.stringify(seed)))
 const ctx=new Context();const registry=new SessionProjectionRegistry(ctx);apply(ctx)
 const snapshot=registry.snapshot(replay)
 assert.deepEqual(snapshot.values.codexContext,h.view())
 const saved=JSON.parse(JSON.stringify(h.state()))
 assert.deepEqual(p.stateSchema.parse(saved),h.state())
})
