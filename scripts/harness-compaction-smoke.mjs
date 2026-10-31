// Real Harness engine, meter and session with a deterministic provider transport.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { mkdtemp, mkdir, cp, symlink, rm } from 'node:fs/promises'
const runtime=process.env.DSH_RUNTIME_ROOT
assert.ok(runtime, 'Set DSH_RUNTIME_ROOT to installed node_modules/@deepseek-ai')
const host=async name=>import(pathToFileURL(`${runtime}/${name}/lib/index.js`))
const {Context}=await host('cordis')
const {Session}=await host('dsh-session')
const {TokenMeter}=await host('dsh-token-meter')
const {BasicCompactionEngine}=await host('dsh-compaction-basic')
const root=await mkdtemp('/tmp/dsh-compact-runtime-')
try {
await mkdir(`${root}/node_modules`)
await symlink(runtime,`${root}/node_modules/@deepseek-ai`)
await cp(new URL('../lib', import.meta.url),`${root}/lib`,{recursive:true})
const {CodexAppServerAdapter}=await import(pathToFileURL(`${root}/lib/index.js`))
class Server {
 threads=[];turns=[];events=[];failure=false;answer='Preserve marker violet-731. Continue the requested work.';interrupted=false
 async account(){return {type:'chatgpt'}}
 async models(){return [{model:'fixture',contextWindow:128000}]}
 async startThread(o){this.threads.push(o);return `t${this.threads.length}`}
 async startTurn(id,o){this.turns.push({id,...o});this.events.push(...(this.failure?[{method:'turn/completed',params:{turn:{status:'failed',error:{message:'context exhausted',codexErrorInfo:'contextWindowExceeded'}}}}]:[
 {method:'item/agentMessage/delta',params:{itemId:'a',delta:this.answer}},
 {method:'item/completed',params:{item:{id:'a',type:'agentMessage'}}},
 {method:'turn/completed',params:{turn:{status:this.interrupted?'interrupted':'completed'}}}
 ]));return 'turn'}
 async nextEvent(){return this.events.shift()}
 async releaseThread(){} async interrupt(){}
}
const server=new Server(), adapter=new CodexAppServerAdapter(server)
const ctx=new Context()
ctx.provide('sessionProjections',{register(){}})
const meter=new TokenMeter(ctx)
let flushes=0
const projections=[]
ctx.provide('sessions',{flush:async()=>{flushes++},registerMessageProjection:p=>projections.push(p)})
ctx.provide('llm',{stream:o=>adapter.stream(o),resolveModelInfo:(p,m)=>adapter.resolveModel(p,m),imageRequestPricing(){}})
const engine=new BasicCompactionEngine(ctx,{auto:false,maxTokens:1024})
function fixture(){
 const s=Session.create('audit')
 s.append('request/header',{reason:'initial',header:{config:{provider:'openai-codex',model:'fixture'}}})
 for(const text of ['Preserve violet-731. '+ 'old facts '.repeat(2500),'Latest request: continue.'])s.append('user/message',{role:'user',id:crypto.randomUUID(),source:{kind:'user'},content:[{type:'text',text}]},{surfaceOp:'append'})
 return s
}
const s=fixture(), signal=AbortSignal.timeout(10000)
const agent={session:s,options:{provider:'openai-codex',model:'fixture'},runMaintenance:fn=>fn(signal)}
const before=s.deriveMessages()
const result=await engine.compactNow(agent,signal)
assert.ok(result)
assert.equal(flushes,1)
assert.ok(s.deriveMessages().length===2)
assert.ok(s.deriveMessages()[0].content.some(b=>b.text?.includes('violet-731')))
assert.deepEqual(s.deriveMessages()[1],before[1])
assert.equal(server.threads[0].ephemeral,true)
assert.deepEqual(server.threads[0].dynamicTools,[])
const restored=Session.create('audit',JSON.parse(JSON.stringify(s.snapshotEvents())))
assert.deepEqual(restored.deriveMessages(),s.deriveMessages())
await Array.fromAsync(adapter.stream({provider:'openai-codex',model:'fixture',sessionId:s.id,messages:restored.deriveMessages(),tools:[]}))
assert.equal(server.threads[1].ephemeral,false)
assert.ok(server.turns[1].input[0].text.includes('violet-731'))
assert.ok(!server.turns[1].input[0].text.includes('old facts'))
const pressure=fixture()
for(let i=0;i<12;i++)pressure.append('user/message',{role:'user',id:crypto.randomUUID(),source:{kind:'user'},content:[{type:'text',text:'older history '.repeat(2500)}]},{surfaceOp:'append'})
pressure.append('turn/start',{turn:1})
const pa={...agent,session:pressure}
const automatic=await engine.compactIfNeeded(pa,'pressure',signal)
assert.ok(automatic)
const callsAfter=server.turns.length
assert.equal(await engine.compactIfNeeded(pa,'pressure',signal),null)
assert.equal(server.turns.length,callsAfter)

const transport=fixture()
for(let i=0;i<10;i++)transport.append('user/message',{role:'user',id:crypto.randomUUID(),source:{kind:'user'},content:[{type:'text',text:'older content '.repeat(2500)}]},{surfaceOp:'append'})
transport.append('turn/start',{turn:1})
const normal=()=>Array.fromAsync(adapter.stream({provider:'openai-codex',model:'fixture',sessionId:'transport',messages:transport.deriveMessages(),tools:[]}))
await assert.rejects(normal(), error=>error.code==='CONTEXT_WINDOW_EXCEEDED')
await engine.compactIfNeeded({...agent,session:transport},'context-overflow',signal)
await normal()
const aging=Session.create('aging')
aging.append('request/header',{reason:'initial',header:{config:{provider:'openai-codex',model:'fixture'}}})
aging.append('turn/start',{turn:0})
aging.append('user/message',{role:'user',id:'old',source:{kind:'user'},content:[{type:'text',text:'old task violet-731 '.repeat(5000)}]},{surfaceOp:'append'})
aging.append('turn/end',{turn:0})
const oldEvents=JSON.parse(JSON.stringify(aging.snapshotEvents()))
oldEvents.at(-1).time=Date.now()-31*60000
const aged=Session.create('aging',oldEvents)
aged.append('turn/start',{turn:1})
aged.append('user/message',{role:'user',id:'new',source:{kind:'user'},content:[{type:'text',text:'Continue the current task'}]},{surfaceOp:'append'})
const {apply:applyPolicy}=await import(pathToFileURL(`${root}/lib/context-policy.js`))
applyPolicy(ctx)
const agedAgent={...agent,session:aged,ctx}
const next=async()=>({kind:'continue'})
await ctx.waterfall('agent/pre-step',{agent:agedAgent,turn:1,signal},next)
await ctx.waterfall('agent/pre-step',{agent:agedAgent,turn:1,signal},next)
assert.equal(aged.snapshotEvents().filter(e=>e.type==='compaction/summary').length,1)
server.failure=true
let overflowCode
try{await Array.fromAsync(adapter.stream({provider:'openai-codex',model:'fixture',messages:before,tools:[]}))}catch(e){overflowCode=e.code}
assert.equal(overflowCode,'CONTEXT_WINDOW_EXCEEDED')
server.failure=false
const failures=[]
for(const mode of ['empty','oversized','interrupted','provider-error']){
 const fs=fixture(), original=fs.deriveMessages()
 const fa={...agent,session:fs}
 server.answer=mode==='empty'?'':mode==='oversized'?'x'.repeat(40000):'A valid summary.'
 server.interrupted=mode==='interrupted'
 server.failure=mode==='provider-error'
 await assert.rejects(()=>engine.compactNow(fa,signal))
 assert.deepEqual(fs.deriveMessages(),original)
 const events=fs.snapshotEvents()
 assert.equal(events.filter(e=>e.type==='compaction/start').length,1)
 assert.equal(events.filter(e=>e.type==='compaction/end').length,1)
 assert.equal(events.filter(e=>e.type==='compaction/summary').length,0)
 assert.deepEqual(Session.create(fs.id,JSON.parse(JSON.stringify(events))).deriveMessages(),original)
 failures.push(mode)
}
// Real context plugins must change the canonical surface seen by this adapter.
server.failure=false
server.interrupted=false
server.answer='Continue after context maintenance.'
const {ToolResultPruner}=await host('dsh-compaction-tool-result-pruner')
const {createToolResultMessage}=await host('dsh-llm')
const pruner=new ToolResultPruner(ctx)
const pruned=fixture()
pruned.append('tool/result',{message:createToolResultMessage({callId:'read-log',isError:false,content:[{type:'text',text:'KEEP-HEAD '+ 'discard-middle '.repeat(3000)+' KEEP-TAIL'}]})},{surfaceOp:'append'})
const pruneResult=pruner.pruneSession(pruned)
assert.equal(pruneResult.pruned.length,1)
assert.ok(pruneResult.charsRemoved>0)
await Array.fromAsync(adapter.stream({provider:'openai-codex',model:'fixture',sessionId:'pruned',messages:pruned.deriveMessages(),tools:[]}))
assert.match(server.turns.at(-1).input[0].text,/tool result middle pruned/)
assert.match(server.turns.at(-1).input[0].text,/KEEP-HEAD/)
assert.match(server.turns.at(-1).input[0].text,/KEEP-TAIL/)
assert.deepEqual(Session.create('pruned',JSON.parse(JSON.stringify(pruned.snapshotEvents()))).deriveMessages(),pruned.deriveMessages())
const offload=await host('dsh-compaction-image-offload')
offload.apply(ctx)
const pictures=Session.create('pictures',undefined,undefined,undefined,projections)
pictures.append('user/message',{role:'user',id:'image-message',source:{kind:'user'},content:[{type:'text',text:'Describe the prior image'},{type:'image',attachment:{attachmentId:'sha256:abcdef1234',name:'prior.png',mediaType:'image/png',bytes:42,width:32,height:32}}]},{surfaceOp:'append'})
const recovery=await ctx.waterfall('agent/request-error',{agent:{session:pictures},failure:{code:'IMAGE_OFFLOAD_REQUIRED',offloadImages:1},signal},async()=>({kind:'stop'}))
assert.deepEqual(recovery,{kind:'retry'})
assert.equal(pictures.deriveMessages()[0].content[1].offloaded,true)
// No image store is provided: an accidental attempt to resend bytes must fail.
await Array.fromAsync(adapter.stream({provider:'openai-codex',model:'fixture',sessionId:'pictures',messages:pictures.deriveMessages(),tools:[]}))
assert.match(server.turns.at(-1).input[0].text,/image omitted to fit request image limits/i)
assert.equal(server.turns.at(-1).input.some(p=>p.type==='image'),false)
assert.deepEqual(Session.create('pictures',JSON.parse(JSON.stringify(pictures.snapshotEvents())),undefined,undefined,projections).deriveMessages(),pictures.deriveMessages())
console.log(JSON.stringify({toolResultPruner:'PASS',imageOffload:'PASS',failurePreservesHistory:failures,manualCompact:'PASS',restoreAndContinue:'PASS',flushes,automaticCompact:'PASS',transportOverflowRecovery:'PASS',idlePolicyWithRealEngine:'PASS',noRepeatedCompact:true,overflowCode},null,2))
}finally{await rm(root,{recursive:true,force:true})}
