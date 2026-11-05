import z from '@deepseek-ai/schemastery';
export const name = 'codex-context-policy';
export const inject = ['agents', 'tokenMeter'];
export const Config = z.object({
    idleMinutes: z.number().min(0).max(525600).default(30).volatile().description('Compact after this many idle minutes. 0 disables idle compaction.'),
    minHistoryTokens: z.number().step(1).min(1).default(16000).volatile().description('Skip small histories below this estimated token count.'),
});
/** Inspect durable activity; a restarted plugin must not repeat compaction in the same turn. */
export function idleHistory(session, now, idleMinutes) {
    if (idleMinutes === 0)
        return false;
    let boundary = now;
    for (let seq = session.seq - 1; seq >= 0; seq--) {
        const event = session.eventAt(seq);
        if (!event)
            continue;
        if (event.type === 'compaction/summary')
            return false;
        if (event.type === 'turn/start')
            boundary = event.time;
        if (event.type === 'turn/end')
            return Number.isFinite(boundary) && Number.isFinite(event.time) && boundary - event.time >= idleMinutes * 60_000;
    }
    return false;
}
function values(config) {
    const read = (value, fallback) => typeof value === 'object' ? value.get() : value ?? fallback;
    const idleMinutes = read(config.idleMinutes, 30), minHistoryTokens = read(config.minHistoryTokens, 16000);
    if (!Number.isFinite(idleMinutes) || idleMinutes < 0 || idleMinutes > 525600
        || !Number.isSafeInteger(minHistoryTokens) || minHistoryTokens < 1)
        throw new Error('Invalid Codex context policy');
    return { idleMinutes, minHistoryTokens };
}
export function apply(ctx, config = {}) {
    values(config);
    const services = ctx;
    const handled = new WeakMap();
    const models = new WeakMap();
    services.on('system-prompt/assemble', async (_assembly, context, next) => {
        if (context.agent)
            models.delete(context.agent);
        const result = await next();
        if (context.agent)
            models.set(context.agent, { provider: result.variables.provider, model: result.variables.model });
        return result;
    }, { prepend: true });
    services.on('agent/pre-step', async ({ agent, turn, signal }, next) => {
        if (signal.aborted || handled.get(agent.session) === turn)
            return next();
        const { idleMinutes, minHistoryTokens } = values(config);
        const route = models.get(agent);
        const durable = agent.session.requestHeader()?.config;
        if (!route?.model || route.provider !== 'openai-codex' || durable?.provider !== route.provider || durable.model !== route.model)
            return next();
        if (!idleHistory(agent.session, Date.now(), idleMinutes))
            return next();
        if (services.tokenMeter.measure(agent.session).surfaceTokens < minHistoryTokens)
            return next();
        const compaction = agent.ctx.get('compaction');
        if (!compaction)
            return next();
        handled.set(agent.session, turn);
        try {
            // Use the host's balanced, transactional compaction path and installed summarizer.
            // The overflow trigger forces a reduction without requiring pressure above capacity.
            await compaction.compactIfNeeded(agent, 'context-overflow', signal);
        }
        catch (error) {
            if (signal.aborted)
                throw error;
            services.logger.warn(`Codex idle compaction failed; continuing with canonical history: ${error instanceof Error ? error.message : String(error)}`);
        }
        return next();
    });
}
export default { name, inject, Config, apply };
