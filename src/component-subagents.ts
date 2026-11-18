import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { defineTool as publicDefineTool } from '@deepseek-ai/dsh-tools'
import { parentAgentOptionsForDelegation as publicParentOptions } from '@deepseek-ai/dsh-subagent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { accountProvider } from './accounts.js'
import { isCodexAccountRoute } from './account-route.js'
import { commonChildModels, type CatalogRuntime } from './subagent-catalog.js'
import './runtime.js'

export const name = 'codex-subagent-tools'
export const inject = ['codexRuntime', 'tools', 'subagents', 'llm']
export const Config = z.object({
  toolName: z.string().default('codex_subagent'),
  catalogToolName: z.union([z.string(), z.literal(false)]).default('list_codex_subagent_models'),
  provider: z.string().default('spawn'),
  agentPreset: z.string().optional(),
  agentOptions: z.object({ model: z.string().optional(), reasoningEffort: z.string().optional() }).strict().optional(),
  maxDepth: z.number().int().nonnegative().optional(),
}).strict()
export type Config = z.infer<typeof Config>

/** Snapshot the active parent route before asynchronous discovery. The returned concrete route is durable child state. */
export async function childOptions(runtime: CatalogRuntime, parentOptions: { provider?: string; model?: string; reasoningEffort?: string }, configured: Config['agentOptions'] = {}, requested: { model?: string; reasoning_effort?: string } = {}, signal?: AbortSignal) {
  if (!isCodexAccountRoute(parentOptions.provider)) throw new Error('Codex delegation requires a concrete Codex parent account')
  const accountId = runtime.accounts.resolveProvider(parentOptions.provider!)
  const provider = accountProvider(accountId)
  const model = requested.model ?? configured.model ?? parentOptions.model
  const reasoningEffort = requested.reasoning_effort ?? configured.reasoningEffort ?? (model === parentOptions.model ? parentOptions.reasoningEffort : undefined)
  const catalog = await commonChildModels(runtime, signal)
  const entry = catalog.find(item => item.model === model)
  if (!entry) throw new Error('Child model is not in the common authenticated Codex catalog')
  if (reasoningEffort !== undefined && !entry.reasoningEfforts.includes(reasoningEffort)) throw new Error('Child reasoning effort is not common to authenticated Codex accounts')
  runtime.accounts.get(accountId)
  if ((await runtime.accountServer(accountId).account(false))?.type !== 'chatgpt') throw new Error('Parent Codex account is not authenticated with ChatGPT')
  signal?.throwIfAborted()
  return { provider, model: entry.model, ...(reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(reasoningEffort) }) }
}

export async function apply(ctx: Context, raw: Config): Promise<void> {
  const config = Config.parse(raw)
  registerSubagentTools(ctx, config, { defineTool: publicDefineTool, parentAgentOptionsForDelegation: publicParentOptions })
}

/** Public-API adapter separated for offline integration tests. */
export function registerSubagentTools(ctx: Context, config: Config, api: { defineTool: typeof publicDefineTool; parentAgentOptionsForDelegation: typeof publicParentOptions }): void {
  const { defineTool, parentAgentOptionsForDelegation } = api
  const runtime = ctx
  if (config.catalogToolName) runtime.tools.register(defineTool({
    name: config.catalogToolName,
    description: 'List child-only Codex models and reasoning efforts common to all authenticated accounts. These models are for Codex delegation, not the chat model picker.',
    parameters: {},
    output: { schema: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { model: { type: 'string', required: true }, reasoningEfforts: { type: 'array', items: { type: 'string' }, required: true } } } }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec) { return commonChildModels(ctx.codexRuntime, exec.signal) },
  }))
  runtime.tools.register(defineTool({
    name: config.toolName,
    description: 'Start an independent Codex subagent on your current account and return its id. Use the child model catalog for optional model selection; completion is delivered to you.',
    parameters: {
      description: { type: 'string', required: true, description: 'Short task label.' },
      prompt: { type: 'string', required: true, description: 'Self-contained task for the child.' },
      cwd: { type: 'string', description: 'Initial working directory; omitted inherits yours.' },
      model: { type: 'string', description: 'Child model from the common catalog; omitted uses the configured role model or inherits yours.' },
      reasoning_effort: { type: 'string', description: 'Common supported effort; omitted preserves the configured role effort or compatible parent effort.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', const: 'activation', required: true }, subagentId: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: 'started subagent ' + value.subagentId }] },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('Codex delegation requires a calling agent')
      const agentOptions = await childOptions(ctx.codexRuntime, parentAgentOptionsForDelegation(exec.agent), config.agentOptions, args, exec.signal)
      await runtime.llm.resolveCallConfig(agentOptions, exec.signal)
      exec.signal.throwIfAborted()
      const maxDepth = runtime.subagents.resolveMaxDepth(config.maxDepth)
      const activation = await runtime.subagents.startActivation({
        provider: config.provider, label: args.description, signal: exec.signal, delivery: 'parent',
        request: {
          parent: exec.agent, prompt: [{ type: 'text', text: args.prompt }], agentOptions,
          ...(args.cwd === undefined ? {} : { cwd: args.cwd }),
          ...(config.agentPreset === undefined ? {} : { agentPreset: config.agentPreset }),
          ...(maxDepth === undefined ? {} : { maxDepth }),
        },
      })
      return { kind: 'activation' as const, subagentId: activation.childId }
    },
  }))
}
export default { name, inject, Config, apply }
