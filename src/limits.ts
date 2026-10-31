export interface LimitWindow {
  id: string
  name: string
  window: 'primary' | 'secondary'
  usedPercent: number
  windowDurationMins: number | null
  resetsAt: number | null
}

/** Expose only provider-reported windows, never credentials/account identities. */
export function limitWindows(payload: Record<string, unknown>): LimitWindow[] {
  const buckets = payload.rateLimitsByLimitId
  const entries: [string, unknown][] = buckets !== null && typeof buckets === 'object' && Object.keys(buckets).length > 0
    ? Object.entries(buckets)
    : [['codex', payload.rateLimits]]
  const rows: LimitWindow[] = []
  for (const [id, raw] of entries) {
    if (raw === null || typeof raw !== 'object') continue
    const bucket = raw as Record<string, unknown>
    const name = typeof bucket.limitName === 'string' && bucket.limitName.trim() ? bucket.limitName : id
    for (const window of ['primary', 'secondary'] as const) {
      const rawWindow = bucket[window]
      if (rawWindow === null || typeof rawWindow !== 'object') continue
      const value = rawWindow as Record<string, unknown>
      const usedPercent = value.usedPercent
      if (typeof usedPercent !== 'number' || !Number.isFinite(usedPercent) || usedPercent < 0) continue
      const windowDurationMins = typeof value.windowDurationMins === 'number' && Number.isSafeInteger(value.windowDurationMins) && value.windowDurationMins > 0 ? value.windowDurationMins : null
      const resetsAt = typeof value.resetsAt === 'number' && Number.isSafeInteger(value.resetsAt) && value.resetsAt > 0 ? value.resetsAt : null
      rows.push({ id, name, window, usedPercent, windowDurationMins, resetsAt })
    }
  }
  return rows
}
