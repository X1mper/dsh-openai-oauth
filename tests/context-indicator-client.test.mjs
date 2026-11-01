import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const source=readFileSync(new URL('../src/context-indicator-client.tsx',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
const exports={}
vm.runInNewContext(compiled,{exports,require:createRequire(import.meta.url)})
const route={provider:'openai-codex',model:'test'}
const view={...route,totalTokens:2313,capacity:10000,source:'contextUsage'}
const render=(selection,data=view)=>exports.CodexContextIndicator({t:key=>key,useProjection:key=>key==='modelSelection'?selection:data})
test('context widget hides other/unknown providers and excludes stale model data',()=>{
 assert.equal(render(undefined),null)
 assert.equal(render({next:{provider:'other',model:'x'},lastUsed:route}),null)
 assert.ok(render({next:route}))
 assert.equal(exports.contextForRoute(view,{...route,model:'new'}),null)
 const pending=render({next:{...route,model:'new'}})
 assert.ok(JSON.stringify(pending).includes('unknown'))
 assert.ok(!JSON.stringify(pending).includes('2313'))
})
test('context registers translations but no standalone composer item',()=>{
 let slots=0
 exports.applyContextIndicator({locale:{register:()=>()=>{}},effect:fn=>fn(),slots:{inject:()=>slots++}})
 assert.equal(slots,0)
})
test('indicator renders estimate marker and accessible bounded percentage without billing',()=>{
 const node=render({next:route})
 const s=JSON.stringify(node)
 assert.ok(s.includes('≈'));assert.ok(s.includes('aria-valuenow'))
 assert.ok(!s.includes('403011'))
 assert.ok(!source.includes('fetch('));assert.ok(!source.includes('setInterval'))
})
