import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { isCodexProvider } from './codex-route.js'
import { validContextSample } from './context-pressure.js'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-projection'
import { deriveEventMessage } from '@deepseek-ai/dsh-session/surface'
import { estimateMessage, estimateToolsTokens } from '@deepseek-ai/dsh-token-meter/estimate'

const routeSchema = z.object({ provider: z.string(), model: z.string() })
const viewSchema = z.object({
  provider: z.string(), model: z.string(), totalTokens: z.number().nonnegative().nullable(),
  capacity: z.number().positive().nullable(),
  source: z.enum(['contextUsage', 'estimated', 'unavailable']),
})
export type CodexContextView = z.infer<typeof viewSchema>
const stateSchema = z.object({
  route: routeSchema.nullable(),
  context: routeSchema.extend({ capacity: z.number().positive().nullable() }).nullable(),
  nodes: z.array(z.object({ seq: z.number().int(), tokens: z.number().nonnegative() })),
  tools: z.number().nonnegative(),
  surfaceTokens: z.number().nonnegative(),
  sample: z.number().nonnegative().nullable(),
  reliable: z.boolean(),
  view: viewSchema.nullable(),
})
type State = z.infer<typeof stateSchema>
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { codexContext: State }
  interface SessionProjectionMap { codexContext: CodexContextView | null }
}
const sameRoute = (a: State['route'], b: State['route']) => a !== null && b !== null && a.provider === b.provider && a.model === b.model
function publish(state: State): State {
  const route = state.route
  const view: CodexContextView | null = !route || !isCodexProvider(route.provider) ? null : {
    ...route,
    capacity: sameRoute(route, state.context) ? state.context!.capacity : null,
    totalTokens: state.sample ?? (state.reliable ? state.surfaceTokens + state.tools : null),
    source: state.sample !== null ? 'contextUsage' : state.reliable ? 'estimated' : 'unavailable',
  }
  return { ...state, view: JSON.stringify(view) === JSON.stringify(state.view) ? state.view : view }
}
/** Numeric surface prices only: no conversation text or full log is retained.
 * Fixed-density estimates exclude hidden provider/image overhead. Unknown
 * projection rewrites invalidate fallback instead of displaying stale prices.
 */
export const codexContextProjection = {
  key: 'codexContext', stateVersion: 2, stateSchema,
  init: () => ({ route: null, context: null, nodes: [], tools: 0, surfaceTokens: 0, sample: null, reliable: true, view: null }),
  apply(state: State, event: import('@deepseek-ai/dsh-session').SessionEvent): State {
    if (event.type === 'request/header') {
      const { provider, model } = event.data.header.config
      return publish({ ...state, route: { provider, model }, tools: estimateToolsTokens(event.data.header), sample: null })
    }
    if (event.type === 'request/context') {
      const { provider, model, contextWindow } = event.data
      const capacity = Number.isSafeInteger(contextWindow) && contextWindow! > 0 ? contextWindow! : null
      return publish({ ...state, context: { provider, model, capacity }, sample: null })
    }
    if (event.type === 'assistant/attempt') return publish({ ...state, sample: null })
    if (String(event.type) === 'image/offload') return publish({ ...state, sample: null, reliable: false })
    if (!('surfaceOp' in event) || event.surfaceOp === undefined) return state
    const message = deriveEventMessage(event)
    const tokens = message === null ? 0 : estimateMessage(message)
    let nodes = state.nodes
    let surfaceTokens = state.surfaceTokens
    let sample = state.sample
    let reliable = state.reliable
    if (event.surfaceOp === 'append') {
      nodes = [...nodes, { seq: event.seq, tokens }]
      surfaceTokens += tokens
      if (sample !== null) sample += tokens
    } else {
      const op = event.surfaceOp
      const start = nodes.findIndex(node => node.seq === op.startSeq)
      const end = nodes.findIndex(node => node.seq === op.endSeq)
      if (start < 0 || end < start) reliable = false
      else {
        surfaceTokens = Math.max(0, surfaceTokens - nodes.slice(start, end + 1).reduce((sum, node) => sum + node.tokens, 0) + tokens)
        if (start === 0 && end === nodes.length - 1) reliable = true
        nodes = [...nodes.slice(0, start), { seq: event.seq, tokens }, ...nodes.slice(end + 1)]
      }
      sample = null
    }
    if (event.type === 'assistant/message') {
      const usage = (event.data.usage as { contextUsage?: { inputTokens?: number; outputTokens?: number; resetsOnHistoryChange?: boolean } } | undefined)?.contextUsage
      sample = state.route && isCodexProvider(state.route.provider)
        ? validContextSample(usage, event.data.interrupted, state.route, event.data.message.source)
        : null
    }
    return publish({ ...state, nodes, surfaceTokens, sample, reliable })
  },
  wire: { viewSchema: viewSchema.nullable(), view: (state: State) => state.view },
} satisfies ProjectionDefinition<'codexContext'>
export const name = 'codex-context-indicator'
export const inject = ['sessionProjections']
export function apply(ctx: Context): void { ctx.sessionProjections.register(codexContextProjection) }
export default { name, inject, apply }
