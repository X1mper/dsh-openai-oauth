import type { Context } from '@deepseek-ai/cordis'
import { registerWeb } from './component-web.js'
export const name = 'codex-web-fetch'
export const inject = ['codexRuntime', 'web']
export function apply(ctx: Context): void { registerWeb(ctx, 'fetch') }
export default { name, inject, apply }
