import { CodexAppServerAdapter } from './adapter.js';
import './runtime.js';
import { accountProvider } from './accounts.js';
export { CodexAppServerAdapter } from './adapter.js';
export const name = 'llm-codex-app-server';
export const inject = ['llm', 'sessions', 'attachments', 'codexRuntime'];
export function apply(ctx) {
    const sessions = ctx.sessions;
    const registrations = new Map();
    const sync = () => {
        const accounts = ctx.codexRuntime.accounts.list();
        for (const [id, entry] of registrations) {
            if (!accounts.some(account => account.id === id)) {
                entry.dispose();
                registrations.delete(id);
            }
        }
        for (const account of accounts) {
            const existing = registrations.get(account.id);
            if (existing) {
                const label = 'Codex · ' + account.name;
                if (existing.adapter.displayName !== label || existing.adapter.provider !== account.provider) {
                    existing.adapter.provider = account.provider;
                    existing.adapter.displayName = label;
                    existing.dispose.replace([account.provider, ...account.aliases]);
                }
                continue;
            }
            const adapter = new CodexAppServerAdapter(ctx.codexRuntime.accountServer(account.id), id => sessions.get(id)?.header.cwd, ctx.attachments, account.provider, 'Codex · ' + account.name, accountProvider(account.id));
            const dispose = ctx.llm.registerAdapter([account.provider, ...account.aliases], adapter);
            registrations.set(account.id, { dispose, adapter });
        }
    };
    sync();
    ctx.effect(() => ctx.codexRuntime.subscribe(sync), 'codex-account.adapters');
}
export default { name, inject, apply };
