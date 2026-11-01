import test from 'node:test'
import assert from 'node:assert/strict'
import { idleHistory, apply, Config } from '../lib/context-policy.js'
const now=Date.now()
function session(events){return {seq:events.length,eventAt:i=>events[i],requestHeader:()=>({config:{provider:'openai-codex',model:'model'}})}}
const old=()=>session([{type:'turn/end',time:now-31*60000,seq:0},{type:'turn/start',time:now,seq:1}])
test('idle threshold is 30 minutes and durable compaction prevents restart loops',()=>{
 assert.equal(idleHistory(old(),now,30),true)
 assert.equal(idleHistory(old(),now,0),false)
 assert.equal(idleHistory(old(),now,32),false)
 assert.equal(idleHistory(session([{type:'turn/end',time:now+60000,seq:0}]),now,30),false)
 assert.equal(idleHistory(session([{type:'turn/end',time:now-31*60000,seq:0},{type:'compaction/summary',time:now,seq:1}]),now,30),false)
 assert.equal(idleHistory(session([]),now,30),false)
})
function harness(config, {tokens=20000,fail=false}={}){
 const handlers=new Map();let calls=0,nextCalls=0,warnings=0,provider='openai-codex'
 const ctx={on:(event,h,prepend)=>{if(event==='system-prompt/assemble')assert.deepEqual(prepend,{prepend:true});handlers.set(event,h)},tokenMeter:{measure:()=>({surfaceTokens:tokens})},compaction:{compactIfNeeded:async(a,trigger)=>{assert.equal(trigger,'context-overflow');calls++;if(fail)throw Error('summary failed')}},logger:{warn:()=>warnings++}}
 apply(ctx,config)
 const agent={session:old(),options:{provider:'openai-codex'},ctx:{get:()=>ctx.compaction}}
 return {agent,setProvider:p=>provider=p,run:async(turn=1,signal=new AbortController().signal)=>{await handlers.get('system-prompt/assemble')({}, {agent}, async()=>({variables:{provider,model:'model'}}));return handlers.get('agent/pre-step')({agent,turn,signal},async()=>{nextCalls++})},counts:()=>({calls,nextCalls,warnings})}
}
test('uses installed compaction once per turn and continues the normal pipeline',async()=>{
 const h=harness();await h.run();await h.run();assert.deepEqual(h.counts(),{calls:1,nextCalls:2,warnings:0})
})
test('failure cannot loop on every tool step',async()=>{
 const h=harness({}, {fail:true});await h.run();await h.run();assert.deepEqual(h.counts(),{calls:1,nextCalls:2,warnings:1})
})
test('disabled, small, different-provider and cancelled requests skip compaction',async()=>{
 const cases=[harness({idleMinutes:0}),harness({}, {tokens:100}),harness(),harness()]
 cases[2].setProvider('other')
 for(const [i,h] of cases.entries()){await h.run(1,i===3?AbortSignal.abort():undefined);assert.equal(h.counts().calls,0)}
})
test('switches providers in both directions and fails closed on unknown',async()=>{
 const h=harness();h.agent.options.provider='other'
 await h.run(1);assert.equal(h.counts().calls,1)
 h.agent.options.provider='openai-codex';h.setProvider('other');await h.run(2);assert.equal(h.counts().calls,1)
 h.setProvider(undefined);await h.run(3);assert.equal(h.counts().calls,1)
 h.setProvider('openai-codex');await h.run(4);assert.equal(h.counts().calls,2)
})
test('idle policy skips first switched step with a different durable summarizer route',async()=>{
 const h=harness();h.agent.session.requestHeader=()=>({config:{provider:'other',model:'model'}})
 await h.run();assert.equal(h.counts().calls,0)
})
test('invalid settings fail activation; native schema carries defaults',()=>{
 for(const config of [{idleMinutes:-1},{idleMinutes:Infinity},{minHistoryTokens:0},{minHistoryTokens:1.5}])assert.throws(()=>harness(config),/Invalid/)
 assert.equal(Config({}).idleMinutes.get(),30)
 assert.equal(Config({}).minHistoryTokens.get(),16000)
})

test('missing session-scoped backend skips without using another session engine',async()=>{const h=harness();h.agent.ctx.get=()=>undefined;await h.run();assert.equal(h.counts().calls,0)})

test('live settings are read on the next turn without remounting',async()=>{let idle=0;const h=harness({idleMinutes:{get:()=>idle}});await h.run(1);assert.equal(h.counts().calls,0);idle=30;await h.run(2);assert.equal(h.counts().calls,1)})
