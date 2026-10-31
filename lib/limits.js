/** Expose only provider-reported windows, never credentials/account identities. */
export function limitWindows(payload) {
    const buckets = payload.rateLimitsByLimitId;
    const entries = buckets !== null && typeof buckets === 'object' && Object.keys(buckets).length > 0
        ? Object.entries(buckets)
        : [['codex', payload.rateLimits]];
    const rows = [];
    for (const [id, raw] of entries) {
        if (raw === null || typeof raw !== 'object')
            continue;
        const bucket = raw;
        const name = typeof bucket.limitName === 'string' && bucket.limitName.trim() ? bucket.limitName : id;
        for (const window of ['primary', 'secondary']) {
            const rawWindow = bucket[window];
            if (rawWindow === null || typeof rawWindow !== 'object')
                continue;
            const value = rawWindow;
            const usedPercent = value.usedPercent;
            if (typeof usedPercent !== 'number' || !Number.isFinite(usedPercent) || usedPercent < 0)
                continue;
            const windowDurationMins = typeof value.windowDurationMins === 'number' && Number.isSafeInteger(value.windowDurationMins) && value.windowDurationMins > 0 ? value.windowDurationMins : null;
            const resetsAt = typeof value.resetsAt === 'number' && Number.isSafeInteger(value.resetsAt) && value.resetsAt > 0 ? value.resetsAt : null;
            rows.push({ id, name, window, usedPercent, windowDurationMins, resetsAt });
        }
    }
    return rows;
}
