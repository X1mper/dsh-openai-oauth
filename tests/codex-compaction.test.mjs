import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { CodexCompactionEngine } from '../lib/codex-compaction.js'

function fixture({occupancy=100, surface=900, aggregate=99000, afterSurface=200}={}) {
 const ctx=new Context()
 ctx.provide('tokenMeter');ctx.provide('llm')
 const header={config:{provider:'openai-codex',model:'test',maxTokens:0},tools:[]}
 const events=[
  {seq:0,type:'user/message',surfaceOp:'append',data:{content:[]}},
  {seq:1,type:'assistant/message',surfaceOp:'append',data:{message:{content:[]},usage:{totalTokens:aggregate,contextUsage:{inputTokens:occupancy,outputTokens:1,resetsOnHistoryChange:true}}}},
  {seq:2,type:'user/message',surfaceOp:'append',data:{content:[]}}
 ]
 const session={seq:3,eventAt:i=>events[i],requestHeader:()=>header,surface:{nodes:[0,1,2],replaceGeneration:0}}
 let measurements=0,regions=0
 ctx.set('tokenMeter',{measure(){measurements++;return {totalTokens:aggregate,surfaceTokens:surface,nodes:session.surface.nodes.map(seq=>({seq,tokens:surface/session.surface.nodes.length}))}}})
 ctx.set('llm',{resolveModelInfo:async()=>({context:{contextWindow:1000},defaultMaxTokens:0})})
 const backend=new CodexCompactionEngine(ctx,{auto:true,maxTokens:100,headroomTokens:0,thresholdRatio:0.8,retainTokens:100})
 const agent={session,ctx,options:{}}
 backend.compactRegion=async()=>{
  regions++
  const seq=events.length
  events.push({seq,type:'user/message',surfaceOp:{op:'replace'},data:{source:{kind:'compact-checkpoint',compactionId:'test'},content:[]}})
  session.seq=events.length;session.surface.nodes=[seq,2];session.surface.replaceGeneration++
  surface=afterSurface
  return {summarySeq:seq-1,compactionId:'test'}
 }
 const assemble=async(provider='openai-codex',model='test')=>{
  const assembly={variables:{provider,model},sections:[],contexts:[],tools:[]}
  await ctx.waterfall('system-prompt/assemble',assembly,{agent},async()=>assembly)
 }
 return {ctx,backend,agent,assemble,header,counts:()=>({measurements,regions}),events}
}
test('aggregate billing cannot cause Codex pressure compaction',async()=>{
 const h=fixture();await h.assemble()
 assert.equal(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),null)
 assert.equal(h.counts().regions,0)
 assert.equal(h.events[1].data.usage.totalTokens,99000)
})
test('real pressure reduces once and does not resummarize fresh checkpoint',async()=>{
 const h=fixture({occupancy:900});await h.assemble()
 const result=await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal)
 assert.ok(result);assert.equal(h.counts().regions,1)
 await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal)
 assert.equal(h.counts().regions,1)
})
test('fresh checkpoint is not summarized again even while estimate exceeds threshold',async()=>{
 const h=fixture({occupancy:900,surface:1500,afterSurface:1000});await h.assemble()
 assert.ok(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal))
 assert.equal(h.counts().regions,1)
})
test('switch into Codex does not summarize with previous provider envelope',async()=>{
 const h=fixture({occupancy:900});h.header.config.provider='other';await h.assemble()
 assert.equal(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),null)
 assert.equal(h.counts().measurements,0)
})
test('switch away from Codex restores stock aggregate-pressure behavior',async()=>{
 const h=fixture({occupancy:900,surface:300,aggregate:100})
 await h.assemble()
 await h.assemble('other')
 h.header.config.provider='other'
 assert.equal(await h.backend.compactIfNeeded(h.agent,'pressure',new AbortController().signal),null)
 assert.equal(h.counts().regions,0)
})
test('cancellation prevents Codex pressure work',async()=>{
 const h=fixture({occupancy:900});await h.assemble()
 await assert.rejects(h.backend.compactIfNeeded(h.agent,'pressure',AbortSignal.abort()),{name:'AbortError'})
 assert.equal(h.counts().regions,0)
})
