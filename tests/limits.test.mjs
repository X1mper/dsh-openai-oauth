import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { limitWindows } from '../lib/limits.js'
import { handleOAuthRequest } from '../lib/oauth-http.js'
const require=createRequire(import.meta.url)
const quota={primary:{usedPercent:37,windowDurationMins:300,resetsAt:1800000000},secondary:{usedPercent:62,windowDurationMins:10080,resetsAt:1800000300}}

test('keeps real primary and secondary percentages, without duplicating multi-bucket defaults',()=>{
 const rows=limitWindows({rateLimits:quota,rateLimitsByLimitId:{codex:quota}})
 assert.equal(rows.length,2)
 assert.deepEqual(rows.map(r=>[r.window,r.usedPercent,r.windowDurationMins]),[['primary',37,300],['secondary',62,10080]])
 assert.deepEqual(limitWindows({rateLimits:{primary:{usedPercent:null},secondary:null}}),[])
 assert.equal(limitWindows({rateLimits:{primary:{usedPercent:103}}})[0].usedPercent,103)
})

test('limits endpoint exposes windows, not account data or credentials; rejects foreign origins',async()=>{
 const server={async account(){return {type:'chatgpt',email:'private@example.invalid'}},async rateLimits(){return {rateLimits:quota,accountId:'private-account-id'}}}
 const response=()=>({status:0,body:'',writeHead(status){this.status=status},end(body){this.body=body}})
 const req={method:'GET',url:'/api/codex-oauth/limits',headers:{host:'127.0.0.1:3080',origin:'http://127.0.0.1:3080'},socket:{remoteAddress:'127.0.0.1'}}
 const res=response();await handleOAuthRequest(server,req,res)
 assert.equal(res.status,200);assert.equal(JSON.parse(res.body).windows.length,2)
 assert.doesNotMatch(res.body,/private|email|accountId/)
 const blocked=response();await handleOAuthRequest(server,{...req,headers:{...req.headers,origin:'https://foreign.invalid'}},blocked)
 assert.equal(blocked.status,403)
 const missing=response();await handleOAuthRequest({...server,async account(){return null}},req,missing)
 assert.deepEqual(JSON.parse(missing.body),{authenticated:false,windows:[]})
})

test('client registers a compact quota pill with accessible localized popover details',async()=>{
 const registrations=[],dictionaries={};let stateIndex=0;const states=[]
 const rows=limitWindows({rateLimits:quota})
 const react={useEffect(){},useId(){return 'quota-panel'},useRef(initial){return {current:initial}},useState(initial){const index=stateIndex++;if(!(index in states))states[index]=index===0?{authenticated:true,windows:rows}:typeof initial==='function'?initial():initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value}]}}
 const source=await readFile(new URL('../src/limits-client.tsx',import.meta.url),'utf8')
 const ts=require('typescript')
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const exported={}
 vm.runInNewContext(compiled,{exports:exported,require:name=>name==='react'?react:require(name),Date,Intl,window:{innerWidth:1024}})
 const ctx={locale:{register(ns,language,dict){dictionaries[language]=dict;return()=>{}}},effect(fn){fn()},slots:{inject(_slot,fn){fn()},register(options,Component){registrations.push({options,Component});return()=>{}}}}
 exported.applyLimits(ctx)
 const registration=registrations.find(r=>r.options.id==='codex-account-limits')
 assert.ok(registration);assert.equal(registration.options.name,'conversation.composer.dock');assert.equal(registration.options.order,2)
 const renderCodex = t => {
  const child = registration.Component({t,useProjection:()=>({next:{provider:'openai-codex'},lastUsed:null})})
  return child.type(child.props)
 }
 assert.equal(registration.Component({useProjection:()=>undefined}),null)
 assert.equal(registration.Component({useProjection:()=>({next:{provider:'other'},lastUsed:{provider:'openai-codex'}})}),null)
 function elements(node){if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=='object')return[];return[node,...elements(node.props?.children)]}
 function text(node){if(Array.isArray(node))return node.map(text).join('');if(typeof node==='string'||typeof node==='number')return String(node);return node?.props?text(node.props.children):''}
 for(const language of ['ru','en','zh']){
  const t=(key,params={})=>Object.entries(params).reduce((text,[name,value])=>text.replaceAll('{'+name+'}',String(value)),dictionaries[language][key])
  const render=()=>{stateIndex=0;return renderCodex(t)}
  let rendered=render()
  const lines=elements(rendered).filter(e=>e.props?.['data-codex-limit-window'])
  assert.equal(lines.length,2)
  if(language==='ru'){assert.match(text(lines[0]),/5 ч37% использовано/);assert.match(text(lines[1]),/7 д62% использовано/)}
  const buttons=elements(rendered).filter(e=>e.props?.['aria-controls'])
  assert.equal(buttons.length,1)
  const trigger=buttons[0]
  assert.equal(trigger.props['aria-haspopup'],'dialog')
  assert.equal(trigger.props['aria-expanded'],false)
  assert.ok(text(trigger).includes('37%'));assert.ok(text(trigger).includes('62%'))
  let shown=false
  const panel={style:{},showPopover(){shown=true},hidePopover(){shown=false},getBoundingClientRect(){return {width:360,height:300}}}
  const details=elements(rendered).find(e=>e.props?.id===trigger.props['aria-controls'])
  assert.equal(details.props.role,'dialog');assert.equal(details.props.popover,'auto')
  details.ref.current=panel
  trigger.ref.current={getBoundingClientRect(){return {left:100,top:500}}}
  trigger.props.onClick();rendered=render()
  const expanded=elements(rendered).find(e=>e.props?.['aria-controls'])
  assert.equal(expanded.props['aria-expanded'],true);assert.equal(shown,true)
  assert.equal(panel.style.left,'100px');assert.equal(panel.style.top,'192px')
  const progress=elements(details).filter(e=>e.props?.role==='progressbar')
  assert.deepEqual(progress.map(e=>e.props['aria-valuenow']),[37,62])
  assert.ok(text(details).includes(t('remaining',{percent:63})))
  assert.ok(text(details).includes(t('explanation')))
  assert.ok(text(details).includes(new Date(rows[0].resetsAt*1000).toLocaleString()))
  assert.ok(elements(details).some(e=>e.type==='button'&&text(e)===t('refresh')))
  expanded.ref.current={getBoundingClientRect(){return {left:100,top:500}}}
  elements(rendered).find(e=>e.props?.role==='dialog').ref.current=panel
  expanded.props.onClick();assert.equal(shown,false)
 }
 rows[0]={...rows[0],windowDurationMins:null,resetsAt:null,usedPercent:103}
 stateIndex=0
 const t=(key,params={})=>Object.entries(params).reduce((text,[name,value])=>text.replaceAll('{'+name+'}',String(value)),dictionaries.en[key])
 const unknown=renderCodex(t)
 assert.match(text(unknown),/Window duration: Not reported/)
 assert.match(text(unknown),/Resets: Not reported/)
 assert.match(text(unknown),/0% remaining/)
 assert.deepEqual(Object.keys(dictionaries).sort(),['en','ru','zh'])
})
