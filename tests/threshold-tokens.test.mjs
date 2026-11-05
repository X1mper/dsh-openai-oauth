import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { CodexCompactionEngine } from '../lib/codex-compaction.js'
import { budgets } from '../lib/pressure-policy.js'
test('absolute cap preserves safety and default budgets', () => {
 const p={headroomTokens:100,retainTokens:100}
 assert.equal(budgets(p,1000,0).threshold,800)
 assert.equal(budgets({...p,thresholdTokens:500},1000,0).threshold,500)
 assert.equal(budgets({...p,thresholdTokens:900},1000,0).threshold,800)
 assert.throws(()=>budgets({...p,thresholdTokens:100},1000,0))
})
test('schema and constructor accept cap without leaking it to Basic', () => {
 const config=CodexCompactionEngine.Config({auto:false,thresholdTokens:200000})
 const engine=new CodexCompactionEngine(new Context(),config)
 assert.equal(engine.config.thresholdTokens,undefined)
 for(const cap of [0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1]) {
  assert.throws(()=>new CodexCompactionEngine(new Context(),{auto:false,thresholdTokens:cap}))
 }
 assert.throws(()=>new CodexCompactionEngine(new Context(),{auto:false,unknown:1}))
})
