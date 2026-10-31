import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import './runtime.js'
import { oauthRoute } from './oauth-http.js'
export const name = 'codex-account'
export const inject = ['codexRuntime', 'webServer']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register(oauthRoute(ctx.codexRuntime.server)), 'codex-account.route')
}
export default { name, inject, apply }
