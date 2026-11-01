import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic';
import { toolPairingBalancedBefore, toolPairingBalancedAfter, isCompactCheckpointSource } from '@deepseek-ai/dsh-compaction';
import { estimateContextPressure } from './context-pressure.js';
import { budgets, policyFor, selectRange } from './pressure-policy.js';
/** Codex pressure backend for the stock installModelSelection composition. */
export class CodexCompactionEngine extends BasicCompactionEngine {
    assembledRoutes = new WeakMap();
    constructor(ctx, config) {
        super(ctx, config);
        ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
            if (context.agent)
                this.assembledRoutes.delete(context.agent);
            const assembly = await next();
            if (context.agent) {
                const { provider, model } = assembly.variables;
                if (provider && model)
                    this.assembledRoutes.set(context.agent, { provider, model });
                else
                    this.assembledRoutes.delete(context.agent);
            }
            return assembly;
        }, { prepend: true });
    }
    async compactIfNeeded(agent, trigger, signal) {
        // Preserve native overflow bookkeeping and its actual failed-request route.
        if (trigger !== 'pressure')
            return super.compactIfNeeded(agent, trigger, signal);
        const target = this.assembledRoutes.get(agent);
        const header = agent.session.requestHeader();
        // Never apply an old Codex envelope while the next route is switching.
        if (header?.config.provider === 'openai-codex' &&
            (!target || target.provider !== header.config.provider || target.model !== header.config.model))
            return null;
        if (target?.provider !== 'openai-codex')
            return super.compactIfNeeded(agent, trigger, signal);
        signal.throwIfAborted();
        // The public region summarizer uses the durable envelope. Do not summarize
        // under a previous model on the first step of a switch. Native overflow
        // recovery remains enabled and sees the newly admitted request's header.
        if (header?.config.provider !== target.provider || header.config.model !== target.model)
            return null;
        const policy = policyFor(this.config, target);
        const info = await this.ctx.llm.resolveModelInfo(target.provider, target.model, signal);
        const { threshold, retain } = budgets(policy, info.context?.contextWindow ?? 0, header.config.maxTokens ?? info.defaultMaxTokens ?? 0);
        const meter = this.ctx.tokenMeter;
        let measurement = meter.measure(agent.session);
        if (estimateContextPressure(agent.session, measurement).totalTokens < threshold)
            return null;
        this.ctx.get('toolResultPruner')?.pruneSession(agent.session);
        let result = null;
        for (let attempt = 0; attempt <= policy.compactionRetries; attempt++) {
            signal.throwIfAborted();
            measurement = meter.measure(agent.session);
            const before = estimateContextPressure(agent.session, measurement).totalTokens;
            if (before < threshold)
                return result;
            const range = selectRange(agent.session, measurement.nodes, retain);
            if (!range)
                return result;
            // Both public boundaries must be balanced, including inherited histories.
            const start = measurement.nodes.find(node => node.seq === range.start).seq;
            const end = measurement.nodes.find(node => node.seq === range.end).seq;
            if (!toolPairingBalancedBefore(agent.session, start) || !toolPairingBalancedAfter(agent.session, end))
                return result;
            const candidate = agent.session.eventAt(start);
            if (start === end && candidate?.type === 'user/message' && candidate.data.source && isCompactCheckpointSource(candidate.data.source)) {
                // New retained-tail events are not new content in this selected span.
                // Only provider-confirmed overflow may force another checkpoint reduction.
                return result;
            }
            result = await this.compactRegion(start, end, agent, signal);
            const after = estimateContextPressure(agent.session, meter.measure(agent.session)).totalTokens;
            if (after < threshold)
                return result;
            // Compare like-for-like surface estimates, not the provider sample with
            // the necessarily heuristic estimate after structural replacement.
            if (meter.measure(agent.session).surfaceTokens >= measurement.surfaceTokens)
                throw new Error('Codex compaction made no estimated surface progress');
        }
        throw new Error('Codex context remains above threshold after configured compaction attempts');
    }
}
export default CodexCompactionEngine;
