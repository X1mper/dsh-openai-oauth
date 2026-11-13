import type { Context } from '@deepseek-ai/cordis'
import './runtime.js'
import { isCodexAccountRoute } from './account-route.js'
import { recordUsage } from './session-records.js'
import { CodexWebSearchProvider } from './web-search.js'
import { CodexWebFetchProvider } from './web-fetch.js'
export function registerWeb(ctx: Context, kind: 'search' | 'fetch'): void {
  const services = ctx as unknown as {
    web: { registerSearchProvider(provider: CodexWebSearchProvider): () => void; registerFetchProvider(provider: CodexWebFetchProvider): () => void }
    get(name: string): { currentInitiator?(): { session: {
      requestContext(): { provider?: string; model?: string } | undefined
    } } | undefined } | undefined
  }
  const current = () => services.get('agents')?.currentInitiator?.()?.session
  const model = () => { const route = current()?.requestContext(); return isCodexAccountRoute(route?.provider) ? route?.model : undefined }
  const record = (event: Record<string, unknown>) => recordUsage(current(), kind, event)
  ctx.effect(() => kind === 'search'
    ? services.web.registerSearchProvider(new CodexWebSearchProvider(() => ctx.codexRuntime.providerServer(current()?.requestContext()?.provider), model, record))
    : services.web.registerFetchProvider(new CodexWebFetchProvider(() => ctx.codexRuntime.providerServer(current()?.requestContext()?.provider), model, record)), `codex-web-${kind}`)
}
