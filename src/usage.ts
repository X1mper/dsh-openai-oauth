import type { TokenUsage } from '@deepseek-ai/dsh-llm'

const counters = ['inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens'] as const
type Counter = typeof counters[number]
type Snapshot = Record<Counter, number>
const zero = (): Snapshot => ({ inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 })

function snapshot(value: unknown): Snapshot | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const result = zero()
  for (const key of counters) {
    // Codex 0.166's schema defaults the optional cache-write counter to zero.
    const count = key === 'cacheWriteInputTokens' ? raw[key] ?? 0 : raw[key]
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return undefined
    result[key] = count
  }
  if (!Number.isSafeInteger(result.inputTokens + result.outputTokens)
    || result.totalTokens !== result.inputTokens + result.outputTokens
    || result.cachedInputTokens + result.cacheWriteInputTokens > result.inputTokens
    || result.reasoningOutputTokens > result.outputTokens) return undefined
  return result
}

/** Convert cumulative thread counters to disjoint, once-only Harness call usage. */
export class CodexUsageTracker {
  private latest = zero()
  private reported = zero()

  checkpoint(): Snapshot { return { ...this.latest } }

  restore(value: unknown): boolean {
    const saved = snapshot(value)
    if (saved === undefined) return false
    this.latest = { ...saved }
    this.reported = { ...saved }
    return true
  }

  update(tokenUsage: unknown): void {
    if (tokenUsage === null || typeof tokenUsage !== 'object') return
    const total = snapshot((tokenUsage as Record<string, unknown>).total)
    if (total === undefined || counters.some(key => total[key] < this.latest[key])) return
    this.latest = total
  }

  take(): (TokenUsage & { totalTokens: number }) | undefined {
    const delta = zero()
    for (const key of counters) delta[key] = this.latest[key] - this.reported[key]
    if (delta.totalTokens === 0) return undefined
    const inputTokens = delta.inputTokens - delta.cachedInputTokens - delta.cacheWriteInputTokens
    if (inputTokens < 0 || delta.reasoningOutputTokens > delta.outputTokens) return undefined
    this.reported = { ...this.latest }
    return {
      inputTokens,
      outputTokens: delta.outputTokens,
      cacheReadTokens: delta.cachedInputTokens,
      cacheWriteTokens: delta.cacheWriteInputTokens,
      reasoningTokens: delta.reasoningOutputTokens,
      totalTokens: delta.totalTokens,
    }
  }
}
