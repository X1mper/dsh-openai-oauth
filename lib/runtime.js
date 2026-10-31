import { Service } from '@deepseek-ai/cordis';
import { AppServer } from './app-server.js';
import { initializeSessionRecords } from './session-records.js';
export class CodexRuntime extends Service {
    server = new AppServer();
    constructor(ctx) {
        super(ctx, 'codexRuntime');
        ctx.effect(() => () => this.server.close(), 'codex-runtime.close');
    }
}
export const name = 'codex-runtime';
export async function apply(ctx) {
    await initializeSessionRecords();
    new CodexRuntime(ctx);
}
export default { name, apply };
