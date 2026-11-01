import { toolPairingBalancedBefore } from '@deepseek-ai/dsh-compaction'
import type { Session, SessionSeq } from '@deepseek-ai/dsh-session'
import type { ResolvedConfig, CompactionPolicyConfig } from '@deepseek-ai/dsh-compaction-basic'

/** Merge only the exact route policy; base configuration is validated by Basic. */
export function policyFor(config: ResolvedConfig, target: { provider: string; model: string }) {
  const override: CompactionPolicyConfig = config.modelPolicies.find(p => p.provider === target.provider && p.model === target.model) ?? {}
  const merged = { ...config, ...override }
  if (override.retainRatio !== undefined) delete merged.retainTokens
  return merged
}

export function budgets(policy: CompactionPolicyConfig, capacity: number, output: number) {
  if (!Number.isSafeInteger(capacity) || capacity <= 0 || !Number.isSafeInteger(output) || output < 0) throw Error('Invalid context capacity or output reservation')
  const threshold = Math.floor(Math.min(capacity * (policy.thresholdRatio ?? 0.8), capacity - output - (policy.headroomTokens ?? 65536)))
  const retain = policy.retainTokens ?? Math.floor((capacity - output) * (policy.retainRatio ?? 0.16))
  if (!(threshold > 0) || !Number.isSafeInteger(retain) || retain < 0 || retain >= threshold) throw Error('Invalid pressure or retention budget')
  return { threshold, retain }
}

export function selectRange(session: Session, nodes: readonly { seq: SessionSeq; tokens: number }[], retain: number,
  balanced = toolPairingBalancedBefore) {
  if (!nodes.length) return null
  if (session.surface.nodes.length !== nodes.length || nodes.some((n, i) => n.seq !== session.surface.nodes[i])) throw Error('Surface measurement mismatch')
  const first = session.eventAt(nodes[0]!.seq)?.type === 'system/message' ? 1 : 0
  let keep = nodes.length, tokens = 0
  for (let i = nodes.length - 1; i >= 0; i--) {
    tokens += nodes[i]!.tokens; keep = i
    if (tokens >= retain) break
  }
  while (keep > first && !balanced(session, nodes[keep]!.seq)) keep--
  return keep <= first ? null : { start: nodes[first]!.seq, end: nodes[keep - 1]!.seq }
}
