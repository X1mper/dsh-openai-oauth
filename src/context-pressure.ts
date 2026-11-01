/** Durable, heuristic pressure estimate; never use aggregate billing usage. */
export interface PressureSession {
  readonly seq: number
  eventAt(seq: number): unknown
  requestHeader(): { readonly tools?: readonly unknown[] } | undefined
}
export interface PressureMeasurement {
  readonly surfaceTokens: number
  readonly nodes: readonly { readonly seq: number; readonly tokens: number }[]
}
export interface ContextPressure { totalTokens: number; source: 'contextUsage' | 'estimated' }

/**
 * Samples cover the assistant output. Only subsequently appended surface nodes
 * are added. Replacements, projection/offload events and changed request metadata
 * invalidate the anchor. The fallback is heuristic, not provider billing; tool
 * schemas use the meter's documented four-characters-per-token approximation.
 * Hidden provider overhead and incomplete old logs cannot be reconstructed.
 */
export function estimateContextPressure(session: PressureSession, measured: PressureMeasurement): ContextPressure {
  const tools = session.requestHeader()?.tools
  const overhead = tools?.length ? Math.ceil(JSON.stringify(tools).length / 4) + 4 : 0
  const fallback = (): ContextPressure => ({ totalTokens: measured.surfaceTokens + overhead, source: 'estimated' })
  for (let seq = session.seq - 1; seq >= 0; seq--) {
    const event = session.eventAt(seq) as any
    if (!event || typeof event.type !== 'string') return fallback()
    if ((event.surfaceOp !== undefined && event.surfaceOp !== 'append') || /offload|image/i.test(event.type)) return fallback()
    if (event.type === 'assistant/message') {
      const usage = event.data?.usage?.contextUsage
      const input = usage?.inputTokens, output = usage?.outputTokens
      if (event.data?.interrupted || usage?.resetsOnHistoryChange !== true || !Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(output) || output < 0 || !Number.isSafeInteger(input + output) || input + output === 0 || !measured.nodes.some(node => node.seq === seq)) return fallback()
      return { totalTokens: input + output + measured.nodes.filter(node => node.seq > seq).reduce((sum, node) => sum + node.tokens, 0), source: 'contextUsage' }
    }
    // An attempt without a committed message may have rebuilt native history.
    // Its billed usage cannot validate the older successful occupancy sample.
    if (event.type === 'assistant/attempt' || event.type === 'request/header' || event.type === 'request/context') return fallback()
  }
  return fallback()
}
