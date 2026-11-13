import { Service, type Context } from '@deepseek-ai/cordis'
import { AppServer } from './app-server.js'
import { AccountRegistry, accountHome } from './accounts.js'
import { initializeSessionRecords } from './session-records.js'
declare module '@deepseek-ai/cordis' { interface Context { codexRuntime: CodexRuntime } }
export class CodexRuntime extends Service {
  readonly accounts = new AccountRegistry()
  readonly server = new AppServer()
  private readonly servers = new Map<string, AppServer>([['default', this.server]])
  private readonly listeners = new Set<() => void>()
  constructor(ctx: Context) {
    super(ctx, 'codexRuntime')
    ctx.effect(() => () => { for (const server of this.servers.values()) server.close() }, 'codex-runtime.close')
  }
  accountIdForProvider(provider?: string): string {
    return !provider || (provider !== 'openai-codex' && !provider.startsWith('openai-codex-')) ? 'default' : this.accounts.resolveProvider(provider)
  }
  providerServer(provider?: string): AppServer { return this.accountServer(this.accountIdForProvider(provider)) }
  accountServer(id: string): AppServer {
    this.accounts.get(id)
    let server = this.servers.get(id)
    if (!server) { server = new AppServer(accountHome(id, this.accounts.home)); this.servers.set(id, server) }
    return server
  }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  changed(): void { for (const fn of this.listeners) fn() }
}
export const name = 'codex-runtime'
export async function apply(ctx: Context): Promise<void> {
  await initializeSessionRecords()
  const runtime = new CodexRuntime(ctx)
  await runtime.accounts.load()
}
export default { name, apply }
