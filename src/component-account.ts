import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import './runtime.js'
import { handleAccountsRequest } from './accounts-http.js'
import { oauthRoute, type RequestGate } from './oauth-http.js'
export const name = 'codex-account'
export const inject = ['codexRuntime', 'webServer', 'connection']
export function apply(ctx: Context): void {
  // WebRoute is raw HTTP: explicitly use the same authentication and CSRF fence
  // as Harness Connection routes. Never infer trust from proxy headers or peers.
  const connection = ctx.get('connection') as unknown as { requestRejection: RequestGate }
  const gate: RequestGate = req => connection.requestRejection(req)
  const route = oauthRoute(ctx.codexRuntime.server, gate)
  ctx.effect(() => ctx.webServer.register({
    ...route,
    handler: (req, res) => {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname
      return path === '/api/codex-oauth/accounts' || path.startsWith('/api/codex-oauth/accounts/')
        ? handleAccountsRequest(ctx.codexRuntime, req, res, gate)
        : route.handler(req, res)
    },
  }), 'codex-account.route')
}
export default { name, inject, apply }
