import { toolPairingBalancedBefore } from '@deepseek-ai/dsh-compaction';
/** Merge only the exact route policy; base configuration is validated by Basic. */
export function policyFor(config, target) {
    const override = config.modelPolicies.find(p => p.provider === target.provider && p.model === target.model) ?? {};
    const merged = { ...config, ...override };
    if (override.retainRatio !== undefined)
        delete merged.retainTokens;
    return merged;
}
export function budgets(policy, capacity, output) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0 || !Number.isSafeInteger(output) || output < 0)
        throw Error('Invalid context capacity or output reservation');
    if (policy.thresholdTokens !== undefined && (!Number.isSafeInteger(policy.thresholdTokens) || policy.thresholdTokens <= 0))
        throw Error('Invalid thresholdTokens');
    const threshold = Math.floor(Math.min(policy.thresholdTokens ?? Infinity, capacity * (policy.thresholdRatio ?? 0.8), capacity - output - (policy.headroomTokens ?? 65536)));
    const retain = policy.retainTokens ?? Math.floor((capacity - output) * (policy.retainRatio ?? 0.16));
    if (!(threshold > 0) || !Number.isSafeInteger(retain) || retain < 0 || retain >= threshold)
        throw Error('Invalid pressure or retention budget');
    return { threshold, retain };
}
export function selectRange(session, nodes, retain, balanced = toolPairingBalancedBefore) {
    if (!nodes.length)
        return null;
    if (session.surface.nodes.length !== nodes.length || nodes.some((n, i) => n.seq !== session.surface.nodes[i]))
        throw Error('Surface measurement mismatch');
    const first = session.eventAt(nodes[0].seq)?.type === 'system/message' ? 1 : 0;
    let keep = nodes.length, tokens = 0;
    for (let i = nodes.length - 1; i >= 0; i--) {
        tokens += nodes[i].tokens;
        keep = i;
        if (tokens >= retain)
            break;
    }
    while (keep > first && !balanced(session, nodes[keep].seq))
        keep--;
    return keep <= first ? null : { start: nodes[first].seq, end: nodes[keep - 1].seq };
}
