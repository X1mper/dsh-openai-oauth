const counters = ['inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens'];
const zero = () => ({ inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 });
function snapshot(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const raw = value;
    const result = zero();
    for (const key of counters) {
        // Codex 0.166's schema defaults the optional cache-write counter to zero.
        const count = key === 'cacheWriteInputTokens' ? raw[key] ?? 0 : raw[key];
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
            return undefined;
        result[key] = count;
    }
    if (!Number.isSafeInteger(result.inputTokens + result.outputTokens)
        || result.totalTokens !== result.inputTokens + result.outputTokens
        || result.cachedInputTokens + result.cacheWriteInputTokens > result.inputTokens
        || result.reasoningOutputTokens > result.outputTokens)
        return undefined;
    return result;
}
/** Convert cumulative thread counters to disjoint, once-only Harness call usage. */
export class CodexUsageTracker {
    latest = zero();
    reported = zero();
    checkpoint() { return { ...this.latest }; }
    restore(value) {
        const saved = snapshot(value);
        if (saved === undefined)
            return false;
        this.latest = { ...saved };
        this.reported = { ...saved };
        return true;
    }
    update(tokenUsage) {
        if (tokenUsage === null || typeof tokenUsage !== 'object')
            return;
        const total = snapshot(tokenUsage.total);
        if (total === undefined || counters.some(key => total[key] < this.latest[key]))
            return;
        this.latest = total;
    }
    take() {
        const delta = zero();
        for (const key of counters)
            delta[key] = this.latest[key] - this.reported[key];
        if (delta.totalTokens === 0)
            return undefined;
        const inputTokens = delta.inputTokens - delta.cachedInputTokens - delta.cacheWriteInputTokens;
        if (inputTokens < 0 || delta.reasoningOutputTokens > delta.outputTokens)
            return undefined;
        this.reported = { ...this.latest };
        return {
            inputTokens,
            outputTokens: delta.outputTokens,
            cacheReadTokens: delta.cachedInputTokens,
            cacheWriteTokens: delta.cacheWriteInputTokens,
            reasoningTokens: delta.reasoningOutputTokens,
            totalTokens: delta.totalTokens,
        };
    }
}
