// Replays only the relevant prompt from a supplied DSH log; never executes tools.
// No transcript or credentials are printed. Both runs use identical input.
import {execFileSync} from 'node:child_process'
import {AppServer} from '../lib/app-server.js'
const {CodexAppServerAdapter}=await import(process.env.DSH_SMOKE_ADAPTER ?? '../lib/index.js')
if (!process.env.DSH_REPRO_LOG) throw new Error('Set DSH_REPRO_LOG to a local session.v4.jsonl.zstd file')
const events=execFileSync('zstd',['-dc',process.env.DSH_REPRO_LOG],{encoding:'utf8',maxBuffer:32*1024*1024}).trim().split('\n').map(JSON.parse)
const system=events.find(e=>e.type==='system/message').data.message.content.map(b=>b.text??'').join('\n')
const {Session}=await import('@deepseek-ai/dsh-session')
const lastAssistant=events.filter(e=>e.type==='assistant/message').at(-1)
const replay=Session.create('isolated-repro',events.filter(e=>e.type!=='session'&&e.seq<lastAssistant.seq)).deriveMessages().filter(m=>m.role!=='system').map(m=>({...m,source: m.source?.kind==='model'?{kind:'model',provider:'openai-codex',model:'gpt-6.1-terra'}:m.source}))
const tools=events.find(e=>e.type==='request/header').data.header.tools
const server=new AppServer()
try {
 const adapter=new CodexAppServerAdapter(server)
 const chunks=await Array.fromAsync(adapter.stream({provider:'openai-codex',model:'gpt-6.1-terra',reasoningEffort:'medium',sessionId:'permission-repro-'+Date.now(),system,tools,signal:AbortSignal.timeout(90000),messages:replay}))
 const blocks=chunks.filter(c=>c.type==='block-end').map(c=>c.block)
 console.log(JSON.stringify({tools:blocks.filter(b=>b.type==='tool-call').map(b=>b.name),answer:blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n'),finish:chunks.at(-1).reason}))
}finally{server.close()}
