import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { registerMigrationTool } from './index.mjs';
test('registration never mutates; explicit action runs in caller context outside activation ALS', async () => {
 const als=new AsyncLocalStorage();
 let tool, calls=0;
 const ctx={tools:{register:value=>{tool=value;}}, configEditor:{configuration:()=>{calls++;assert.notEqual(als.getStore(),'hmr');return [];}}};
 als.run('hmr',()=>registerMigrationTool(ctx,{mode:'dry-run'},x=>x));
 assert.equal(calls,0); assert.equal(tool.name,'codex_apply_subagent_accounts');
 assert.deepEqual(tool.parameters,{});
 const result=await tool.execute({});
 assert.equal(calls,1);assert.equal(result.status,'complete');assert.equal(result.mode,'dry-run');
 assert.equal(tool.isConcurrencySafe(),false);
});
test('explicit action returns only sanitized failure without raw private errors', async () => {
 let tool;
 const ctx={tools:{register:value=>{tool=value;}},configEditor:{configuration:()=>{throw new Error('HMR transactions cannot be nested PRIVATE_TOKEN');}}};
 registerMigrationTool(ctx,{mode:'apply'},x=>x);
 const result=await tool.execute({});
 assert.equal(result.code,'NESTED_HMR_TRANSACTION');
 assert.equal(result.status,'failed');
 assert.ok(!JSON.stringify(result).includes('PRIVATE_TOKEN'));
});
