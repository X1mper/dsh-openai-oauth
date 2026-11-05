import type {} from '@deepseek-ai/dsh-token-meter'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'
import type { BasicCompactionConfig } from '@deepseek-ai/dsh-compaction-basic'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { toolPairingBalancedBefore, toolPairingBalancedAfter, isCompactCheckpointSource } from '@deepseek-ai/dsh-compaction'
import type { CompactionTrigger, CompactionResult } from '@deepseek-ai/dsh-compaction'
import { estimateContextPressure } from './context-pressure.js'
import { budgets, policyFor, selectRange } from './pressure-policy.js'

import Schema from '@deepseek-ai/schemastery'

type LiveThreshold = number | { get(): number | undefined }
export type CodexCompactionConfig = BasicCompactionConfig & { thresholdTokens?: LiveThreshold }

function readThreshold(value: LiveThreshold | undefined): number | undefined {
  const threshold = typeof value === 'object' ? value.get() : value
  if (threshold !== undefined && (!Number.isSafeInteger(threshold) || threshold <= 0)) throw new Error('thresholdTokens must be a positive safe integer')
  return threshold
}

type Route = { provider: string; model: string }
/** Codex pressure backend for the stock installModelSelection composition. */
export class CodexCompactionEngine extends BasicCompactionEngine {
  private readonly assembledRoutes = new WeakMap<Agent, Route>()
  static override Config: Schema<BasicCompactionConfig & { thresholdTokens?: number }, CodexCompactionConfig> = Schema.object({
    ...BasicCompactionEngine.Config.dict,
    thresholdTokens: Schema.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).volatile().description('Codex pressure compaction token cap'),
  }) as unknown as Schema<BasicCompactionConfig & { thresholdTokens?: number }, CodexCompactionConfig>
  private readonly thresholdTokens?: LiveThreshold
  constructor(ctx: Context, config: CodexCompactionConfig = {}) {
    const { thresholdTokens, ...basicConfig } = config
    readThreshold(thresholdTokens)
    super(ctx, basicConfig)
    this.thresholdTokens = thresholdTokens
    ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
      if (context.agent) this.assembledRoutes.delete(context.agent)
      const assembly = await next()
      if (context.agent) {
        const { provider, model } = assembly.variables
        if (provider && model) this.assembledRoutes.set(context.agent, { provider, model })
        else this.assembledRoutes.delete(context.agent)
      }
      return assembly
    }, { prepend: true })
  }

  override async compactIfNeeded(agent: Agent, trigger: CompactionTrigger, signal: AbortSignal): Promise<CompactionResult | null> {
    // Preserve native overflow bookkeeping and its actual failed-request route.
    if (trigger !== 'pressure') return super.compactIfNeeded(agent, trigger, signal)
    const target = this.assembledRoutes.get(agent)
    const header = agent.session.requestHeader()
    // Never apply an old Codex envelope while the next route is switching.
    if (header?.config.provider === 'openai-codex' &&
        (!target || target.provider !== header.config.provider || target.model !== header.config.model)) return null
    if (target?.provider !== 'openai-codex') return super.compactIfNeeded(agent, trigger, signal)
    signal.throwIfAborted()
    // The public region summarizer uses the durable envelope. Do not summarize
    // under a previous model on the first step of a switch. Native overflow
    // recovery remains enabled and sees the newly admitted request's header.
    if (header?.config.provider !== target.provider || header.config.model !== target.model) return null
    const policy = policyFor(this.config, target)
    const info = await this.ctx.llm.resolveModelInfo(target.provider, target.model, signal)
    const { threshold, retain } = budgets({ ...policy, thresholdTokens: readThreshold(this.thresholdTokens) }, info.context?.contextWindow ?? 0, header.config.maxTokens ?? info.defaultMaxTokens ?? 0)
    const meter = this.ctx.tokenMeter
    let measurement = meter.measure(agent.session)
    const initial = estimateContextPressure(agent.session, measurement).totalTokens
    if (initial < threshold) return null
    // Capture before our pruner invalidates the sample. Local to this invocation.
    let correction = Math.max(0, initial - measurement.surfaceTokens)
    this.ctx.get('toolResultPruner')?.pruneSession(agent.session)
    let result: CompactionResult | null = null
    for (let attempt = 0; attempt <= policy.compactionRetries; attempt++) {
      signal.throwIfAborted()
      measurement = meter.measure(agent.session)
      const before = Math.max(estimateContextPressure(agent.session, measurement).totalTokens, measurement.surfaceTokens + correction)
      if (before < threshold) return result
      const fixed = Math.max(0, before - measurement.surfaceTokens)
      const range = selectRange(agent.session, measurement.nodes, Math.max(0, retain - fixed))
      if (!range) return result
      // Both public boundaries must be balanced, including inherited histories.
      const start = measurement.nodes.find(node => node.seq === range.start)!.seq
      const end = measurement.nodes.find(node => node.seq === range.end)!.seq
      if (!toolPairingBalancedBefore(agent.session, start) || !toolPairingBalancedAfter(agent.session, end)) return result
      const candidate = agent.session.eventAt(start)
      if (candidate?.type === 'user/message' && candidate.data.source && isCompactCheckpointSource(candidate.data.source)) {
        const checkpoint = measurement.nodes.find(node => node.seq === start)!.tokens
        const startIndex = measurement.nodes.findIndex(node => node.seq === start)
        const endIndex = measurement.nodes.findIndex(node => node.seq === end)
        // Replacement checkpoints have newer sequence IDs than their retained tail.
        const fresh = measurement.nodes.slice(startIndex + 1, endIndex + 1).reduce((sum, node) => sum + node.tokens, 0)
        // A checkpoint plus a few small tool exchanges is not a useful new span.
        // This survives replay and fresh provider samples; native overflow bypasses it.
        if (fresh < Math.max(1024, checkpoint / 2)) return result
      }
      result = await this.compactRegion(start, end, agent, signal)
      // Only this successful, owned replacement may retain the measured overhead.
      correction = fixed
      const after = Math.max(estimateContextPressure(agent.session, meter.measure(agent.session)).totalTokens, meter.measure(agent.session).surfaceTokens + correction)
      if (after < threshold) return result
      // Compare like-for-like surface estimates, not the provider sample with
      // the necessarily heuristic estimate after structural replacement.
      if (meter.measure(agent.session).surfaceTokens >= measurement.surfaceTokens) throw new Error('Codex compaction made no estimated surface progress')
    }
    throw new Error('Codex context remains above threshold after configured compaction attempts')
  }
}
export default CodexCompactionEngine
