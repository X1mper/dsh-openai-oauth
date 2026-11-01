// Live registration/dispatch check. Resource tools return fixtures, never user data.
import assert from 'node:assert/strict'
import {AppServer} from '../lib/app-server.js'
const {CodexAppServerAdapter}=await import(process.env.DSH_SMOKE_ADAPTER ?? '../lib/index.js')
const server=new AppServer(), adapter=new CodexAppServerAdapter(server)
try {
 for(const name of ['list_mcp_resources','list_mcp_resource_templates','read_mcp_resource']) {
  const options={provider:'openai-codex',model:process.env.DSH_SMOKE_MODEL??'gpt-6.1-terra',reasoningEffort:'low',sessionId:`resource-probe-${name}-${Date.now()}`,signal:AbortSignal.timeout(60000),system:'Use the supplied Harness resource probe tool exactly once, then report its fixture result. Do not use any native Codex tools.',tools:[{name,description:'Harness resource probe. Returns the requested test marker. Call this supplied dynamic tool, not a built-in Codex resource tool.',parameters:{type:'object',properties:{},additionalProperties:false}}]}
  const messages=[{role:'user',content:[{type:'text',text:'Call the supplied Harness resource probe now.'}]}]
  const first=await Array.fromAsync(adapter.stream({...options,messages}));const blocks=first.filter(c=>c.type==='block-end').map(c=>c.block)
  const call=blocks.find(b=>b.type==='tool-call');assert.equal(call?.name,name,`Dynamic tool was not dispatched: ${JSON.stringify(blocks)}`)
  messages.push({role:'assistant',content:blocks},{role:'tool',toolCallId:call.id,content:[{type:'text',text:'RESOURCE_PROBE_OK'}]})
  const second=await Array.fromAsync(adapter.stream({...options,messages}));assert.equal(second.at(-1).reason.kind,'stop')
  console.log(JSON.stringify({tool:name,dispatch:'PASS'}))
 }
}finally{server.close()}
