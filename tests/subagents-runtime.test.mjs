import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerSubagentTools, Config } from '../lib/component-subagents.js'
test('real public defineTool dispatch preflights concrete route and passes lifecycle scope/cancellation/depth', async t => {
  let defineTool, parentAgentOptionsForDelegation
  try {
    ;({ defineTool } = await import(process.env.DSH_TOOLS_TEST_URL ?? '@deepseek-ai/dsh-tools'))
    ;({ parentAgentOptionsForDelegation } = await import(process.env.DSH_SUBAGENT_TEST_URL ?? '@deepseek-ai/dsh-subagent'))
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
    t.skip('Optional public peers unavailable; set DSH_TOOLS_TEST_URL and DSH_SUBAGENT_TEST_URL to installed public entry URLs')
    return
  }
  const tools = new Map(), calls = []
  const server = { account: async () => ({ type: 'chatgpt' }), models: async () => [{ model: 'm', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }] }
  const ctx = {
    codexRuntime: { accounts: { list: () => [{ id: 'default' }], get: () => ({}), resolveProvider: route => { assert.equal(route, 'openai-codex-default'); return 'default' } }, accountServer: () => server },
    tools: { register: tool => tools.set(tool.name, tool) },
    llm: { resolveCallConfig: async options => calls.push(options) },
    subagents: { resolveMaxDepth: depth => { assert.equal(depth, undefined); return 2 }, startActivation: async input => { calls.push(input); return { childId: 'child' } } },
  }
  registerSubagentTools(ctx, Config.parse({ agentOptions: { model: 'm', reasoningEffort: 'high' } }), { defineTool, parentAgentOptionsForDelegation })
  const parent = { options: { provider: 'stale' }, session: { requestHeader: () => ({ config: { provider: 'openai-codex-default', model: 'm' } }) } }
  const signal = new AbortController().signal
  assert.deepEqual(await tools.get('codex_subagent').execute({ description: 'task', prompt: 'work' }, { agent: parent, signal }), { kind: 'activation', subagentId: 'child' })
  assert.equal(calls[0].provider, 'openai-codex')
  assert.equal(calls[1].parent, parent)
  assert.equal(calls[1].maxDepth, 2)
  assert.equal(calls[1].signal, signal)
  assert.equal(calls[1].delivery, 'parent')
  assert.deepEqual(await tools.get('list_codex_subagent_models').execute({}, { signal }), [{ model: 'm', reasoningEfforts: ['high'] }])
})
