import type { Context } from '@deepseek-ai/cordis'
import { CodexAppServerAdapter } from './adapter.js'
import './runtime.js'
export { CodexAppServerAdapter } from './adapter.js'
export const name = 'llm-codex-app-server'
export const inject = ['llm', 'sessions', 'attachments', 'codexRuntime']
export function apply(ctx: Context): void {
  const sessions = (ctx as Context & {
    sessions: { get(id: string): { header: { cwd?: string } } | undefined }
  }).sessions
  ctx.llm.registerAdapter(['openai-codex'], new CodexAppServerAdapter(ctx.codexRuntime.server,
    id => sessions.get(id)?.header.cwd, ctx.attachments))
}
export default { name, inject, apply }
