import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { Session } from '@deepseek-ai/dsh-session'
import { TokenMeter } from '@deepseek-ai/dsh-token-meter'
import { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm/message'
import { CodexCompactionEngine } from '../lib/codex-compaction.js'

async function fixture({failure=false, capacity=10000, history=4000, summary='Preserved user requirements and pending task.', retain=500, retries=3}={}) {
 const ctx=new Context()
 ctx.provide('logger');ctx.set('logger',{info(){},warn(){}})
 ctx.provide('sessionProjections')
 ctx.set('sessionProjections',{register(){}})
 ctx.provide('llm')
 ctx.set('llm',{resolveModelInfo:async()=>({context:{contextWindow:capacity},defaultMaxTokens:100}),imageRequestPricing(){}})
 const meter=new TokenMeter(ctx)
 let calls=0
 class Backend extends CodexCompactionEngine {
  async summarize() {
   calls++
   if(failure) throw new Error('summary failed')
   return {summary,provider:'openai-codex',model:'test',usage:{inputTokens:100,outputTokens:10,totalTokens:110}}
  }
 }
 const backend=new Backend(ctx,{auto:true,thresholdRatio:0.8,headroomTokens:100,maxTokens:100,retainTokens:retain,compactionRetries:retries})
 const session=Session.create('transaction-test')
 session.append('turn/start',{turn:1})
 session.append('request/header',{header:{config:{provider:'openai-codex',model:'test',maxTokens:100}},reason:'initial'})
 for(let i=0;i<3;i++)session.append('user/message',createUserMessage({content:[{type:'text',text:'history '.repeat(history)}],source:{kind:'user'}}),{surfaceOp:'append'})
 const agent={ctx,session,options:{}}
 const selection={current:{provider:'openai-codex',model:'test'},assembled:undefined}
 installModelSelection(ctx,selection)
 const assemble=async()=>{
  const assembly={variables:{},sections:[],contexts:[],tools:[]}
  return ctx.waterfall('system-prompt/assemble',assembly,{agent},async()=>assembly)
 }
 await assemble()
 return {backend,agent,meter,selection,assemble,calls:()=>calls,events:()=>Array.from({length:session.seq},(_,i)=>session.eventAt(i))}
}
test('large fixed occupancy selects useful history and does not recycle checkpoint with tiny exchanges',async()=>{
 const h=await fixture({capacity:240000,history:4000,summary:'checkpoint '.repeat(400),retain:30000})
 const sample=(input)=>{
  h.agent.session.append('step/start',{turn:1,step:1})
  h.agent.session.append('assistant/message',{turn:1,step:1,stream:[],message:createAssistantMessage({source:{provider:'openai-codex',model:'test'},content:[{type:'text',text:'Tool completed.'}]}),usage:{inputTokens:input,outputTokens:10,totalTokens:input+10,contextUsage:{inputTokens:input,outputTokens:10,resetsOnHistoryChange:true}}},{surfaceOp:'append'})
  h.agent.session.append('step/end',{turn:1,step:1})
 }
 sample(195020)
 h.agent.ctx.provide('toolResultPruner')
 h.agent.ctx.set('toolResultPruner',{pruneSession(session){
  // Simulate the structural invalidation performed by the optional pruner.
  session.append('test/offload',{})
 }})
 assert.ok(h.meter.measure(h.agent.session).surfaceTokens<30000)
 assert.ok(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal))
 assert.equal(h.calls(),1)
 // Repeated short exchanges and new high provider samples must not re-summarize.
 for(let i=0;i<3;i++){
  h.agent.session.append('user/message',createUserMessage({content:[{type:'text',text:'tool result: done'}],source:{kind:'user'}}),{surfaceOp:'append'})
  sample(196579+i*100)
  assert.equal(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),null)
 }
 assert.equal(h.calls(),1)
 h.agent.session=Session.create('pressure-replay',JSON.parse(JSON.stringify(h.events())))
 await h.assemble()
 assert.equal(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),null)
 assert.equal(h.calls(),1)
})
test('successful replacement does not mistake heuristic fallback for calibrated relief',async()=>{
 const h=await fixture({capacity:240000,retain:30000,retries:0})
 const session=h.agent.session
 session.append('step/start',{turn:1,step:1})
 session.append('assistant/message',{turn:1,step:1,stream:[],message:createAssistantMessage({source:{provider:'openai-codex',model:'test'},content:[{type:'text',text:'Done.'}]}),usage:{inputTokens:250000,outputTokens:10,totalTokens:250010,contextUsage:{inputTokens:250000,outputTokens:10,resetsOnHistoryChange:true}}},{surfaceOp:'append'})
 session.append('step/end',{turn:1,step:1})
 const before=h.meter.measure(session).surfaceTokens
 await assert.rejects(h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),/remains above threshold/)
 assert.equal(h.calls(),1)
 const after=h.meter.measure(session).surfaceTokens
 assert.ok(after<before)
 assert.ok(after<192000)
 assert.ok(250010-before+after>192000)
 assert.equal(h.events().filter(e=>e.type==='compaction/summary').length,1)
})
test('checkpoint with older retained tail uses surface order, not sequence order',async()=>{
 const h=await fixture()
 await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal)
 const nodes=h.meter.measure(h.agent.session).nodes
 assert.ok(nodes[0].seq>nodes[1].seq)
 h.agent.session.append('user/message',createUserMessage({content:[{type:'text',text:'newest retained message '.repeat(120)}],source:{kind:'user'}}),{surfaceOp:'append'})
 // Old retained history is substantial useful material, despite its lower seq.
 assert.ok(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal))
 assert.equal(h.calls(),2)
})
test('real session, meter and region transaction replace history once',async()=>{
 const h=await fixture()
 const before=h.meter.measure(h.agent.session).surfaceTokens
 const result=await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal)
 assert.ok(result)
 assert.equal(h.calls(),1)
 assert.ok(h.meter.measure(h.agent.session).surfaceTokens<before)
 const replacement=h.events().find(e=>e.type==='user/message'&&typeof e.surfaceOp==='object')
 assert.ok(replacement)
 assert.notEqual(replacement.seq,result.summarySeq)
 assert.deepEqual(h.events().filter(e=>e.type.startsWith('compaction/')).map(e=>e.type),['compaction/start','compaction/summary','compaction/end'])
 assert.equal(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),null)
 assert.equal(h.calls(),1)
 const summary=h.agent.session.eventAt(result.summarySeq)
 assert.equal(summary.data.usage.totalTokens,110)
 // Replay a detached serialized log through the actual Session implementation.
 h.agent.session=Session.create('replayed-test',JSON.parse(JSON.stringify(h.events())))
 await h.assemble()
 assert.equal(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),null)
 assert.equal(h.calls(),1)
 assert.equal(h.agent.session.eventAt(result.summarySeq).data.usage.totalTokens,110)
})
test('inherited automatic pre-step dispatches Codex policy and continues once',async()=>{
 const h=await fixture()
 let nextCalls=0
 const payload={agent:h.agent,signal:new AbortController().signal,step:2,turn:1,messages:[]}
 const next=async()=>{nextCalls++;return {kind:'continue',messages:[]}}
 await h.agent.ctx.waterfall('agent/pre-step',payload,next)
 await h.agent.ctx.waterfall('agent/pre-step',payload,next)
 assert.equal(nextCalls,2)
 assert.equal(h.calls(),1)
})
test('native overflow retries only after durable replacement and remains bounded',async()=>{
 const h=await fixture()
 const payload={agent:h.agent,failure:{code:'CONTEXT_WINDOW_EXCEEDED'},signal:new AbortController().signal}
 let nextCalls=0
 const next=async()=>{nextCalls++;return {kind:'unhandled'}}
 const generation=h.agent.session.surface.replaceGeneration
 assert.deepEqual(await h.agent.ctx.waterfall('agent/request-error',payload,next),{kind:'retry'})
 assert.ok(h.agent.session.surface.replaceGeneration>generation)
 assert.equal(h.calls(),1)
 assert.deepEqual(await h.agent.ctx.waterfall('agent/request-error',payload,next),{kind:'unhandled'})
 assert.equal(h.calls(),1)
 assert.equal(nextCalls,1)
})
test('native overflow does not retry failed transaction or cancellation',async()=>{
 const h=await fixture({failure:true})
 const payload={agent:h.agent,failure:{code:'CONTEXT_WINDOW_EXCEEDED'},signal:new AbortController().signal}
 const generation=h.agent.session.surface.replaceGeneration
 const next=async()=>({kind:'unhandled'})
 assert.deepEqual(await h.agent.ctx.waterfall('agent/request-error',payload,next),{kind:'unhandled'})
 assert.equal(h.agent.session.surface.replaceGeneration,generation)
 assert.equal(h.calls(),1)
 payload.signal=AbortSignal.abort()
 assert.deepEqual(await h.agent.ctx.waterfall('agent/request-error',payload,next),{kind:'unhandled'})
 assert.equal(h.calls(),1)
})
test('new work after a checkpoint permits legitimate additional compaction',async()=>{
 const h=await fixture()
 await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal)
 const session=h.agent.session
 for(let i=0;i<2;i++)session.append('user/message',createUserMessage({content:[{type:'text',text:'new work '.repeat(4000)}],source:{kind:'user'}}),{surfaceOp:'append'})
 assert.ok(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal))
 assert.equal(h.calls(),2)
})
test('real meter retains aggregate billing while Codex occupancy survives Session replay',async()=>{
 const h=await fixture()
 const session=h.agent.session
 session.append('step/start',{turn:1,step:1})
 const usage={inputTokens:778,cacheReadTokens:401920,outputTokens:313,totalTokens:403011,contextUsage:{inputTokens:2000,outputTokens:313,resetsOnHistoryChange:true}}
 const event=session.append('assistant/message',{turn:1,step:1,stream:[],message:createAssistantMessage({source:{provider:'openai-codex',model:'test'},content:[{type:'text',text:'Completed.'}]}),usage},{surfaceOp:'append'})
 session.append('step/end',{turn:1,step:1})
 assert.ok(h.meter.measure(session).totalTokens>10000)
 assert.equal(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),null)
 assert.equal(h.calls(),0)
 const seed=JSON.parse(JSON.stringify(h.events()))
 h.agent.session=Session.create('billing-replay-test',seed)
 await h.assemble()
 assert.deepEqual(h.agent.session.eventAt(event.seq).data.usage,usage)
 assert.equal(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),null)
 assert.equal(h.calls(),0)
})
test('retained new work cannot trigger checkpoint-only resummarization',async()=>{
 const h=await fixture()
 await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal)
 h.agent.session.append('user/message',createUserMessage({content:[{type:'text',text:'continue'}],source:{kind:'user'}}),{surfaceOp:'append'})
 assert.ok(h.meter.measure(h.agent.session).surfaceTokens>8000)
 for(let i=0;i<2;i++)assert.equal(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),null)
 assert.equal(h.calls(),1)
})
test('native model switch away from Codex defers old-envelope pressure',async()=>{
 const h=await fixture()
 h.selection.current={provider:'other',model:'other-model'}
 await h.assemble()
 assert.equal(h.agent.session.requestHeader().config.provider,'openai-codex')
 assert.equal(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),null)
 assert.equal(h.calls(),0)
})
test('real failed transaction closes lock and leaves surface unchanged',async()=>{
 const h=await fixture({failure:true})
 const nodes=[...h.agent.session.surface.nodes]
 await assert.rejects(h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),/summary failed/)
 assert.deepEqual(h.agent.session.surface.nodes,nodes)
 assert.deepEqual(h.events().filter(e=>e.type.startsWith('compaction/')).map(e=>e.type),['compaction/start','compaction/end'])
 assert.equal(h.calls(),1)
})
