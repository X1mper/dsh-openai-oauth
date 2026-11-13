import { Service } from '@deepseek-ai/cordis';
import { AppServer } from './app-server.js';
import { AccountRegistry, accountHome } from './accounts.js';
import { initializeSessionRecords } from './session-records.js';
export class CodexRuntime extends Service {
    accounts = new AccountRegistry();
    server = new AppServer();
    servers = new Map([['default', this.server]]);
    listeners = new Set();
    constructor(ctx) {
        super(ctx, 'codexRuntime');
        ctx.effect(() => () => { for (const server of this.servers.values())
            server.close(); }, 'codex-runtime.close');
    }
    accountIdForProvider(provider) {
        return !provider || (provider !== 'openai-codex' && !provider.startsWith('openai-codex-')) ? 'default' : this.accounts.resolveProvider(provider);
    }
    providerServer(provider) { return this.accountServer(this.accountIdForProvider(provider)); }
    accountServer(id) {
        this.accounts.get(id);
        let server = this.servers.get(id);
        if (!server) {
            server = new AppServer(accountHome(id, this.accounts.home));
            this.servers.set(id, server);
        }
        return server;
    }
    subscribe(fn) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
    changed() { for (const fn of this.listeners)
        fn(); }
}
export const name = 'codex-runtime';
export async function apply(ctx) {
    await initializeSessionRecords();
    const runtime = new CodexRuntime(ctx);
    await runtime.accounts.load();
}
export default { name, apply };
