import assert from 'node:assert/strict';
import { transformPreset, MODULE } from './transform.mjs';
const tool = (id, config) => ({ id, name: '@deepseek-ai/dsh-tool-subagent', config });
const original = { id: 'standard', plugins: [{id:'persona',config:{prefix:'Private prompt must survive'}},{id:'delegation',group:true,config:[
 tool('tool-subagent',{provider:'spawn',toolName:'subagent',modelSelectionSettings:true}),
 tool('role',{provider:'spawn',toolName:'worker',agentOptions:{provider:'openai-codex',model:'gpt-6.1-terra',reasoningEffort:'high'}}),
 tool('fork',{provider:'fork',toolName:'subagent_fork'}),
 tool('other',{provider:'spawn',agentOptions:{provider:'kimi',model:'k3'}})
]}]};
const copy = structuredClone(original);
const result = transformPreset(original);
assert.deepEqual(original,copy);
assert.equal(result.changes.length,2);
assert.deepEqual(result.config.plugins[0], original.plugins[0]);
const rows = result.config.plugins[1].config;
assert.equal(rows[0].name,MODULE);
assert.equal(rows[0].config.catalogToolName,'list_codex_subagent_models');
assert.equal(rows[1].config.catalogToolName,false);
assert.deepEqual(rows[1].config.agentOptions,{model:'gpt-6.1-terra',reasoningEffort:'high'});
assert.deepEqual(rows.slice(2),original.plugins[1].config.slice(2));
assert.deepEqual(transformPreset(result.config),{config:result.config,changes:[]});
assert.deepEqual(transformPreset({...original,id:'unrelated'}).changes,[]);
console.info('Synthetic migration invariants passed');
