import { Service, type Context } from '@deepseek-ai/cordis'
import { AppServer } from './app-server.js'
import { initializeSessionRecords } from './session-records.js'
declare module '@deepseek-ai/cordis' { interface Context { codexRuntime: CodexRuntime } }
export class CodexRuntime extends Service {
  readonly server = new AppServer()
  constructor(ctx: Context) {
    super(ctx, 'codexRuntime')
    ctx.effect(() => () => this.server.close(), 'codex-runtime.close')
  }
}
export const name = 'codex-runtime'
export async function apply(ctx: Context): Promise<void> {
  await initializeSessionRecords()
  new CodexRuntime(ctx)
}
export default { name, apply }
