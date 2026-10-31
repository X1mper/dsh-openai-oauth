import './runtime.js';
import { recordUsage } from './session-records.js';
import { CodexWebSearchProvider } from './web-search.js';
import { CodexWebFetchProvider } from './web-fetch.js';
export function registerWeb(ctx, kind) {
    const services = ctx;
    const current = () => services.get('agents')?.currentInitiator?.()?.session;
    const model = () => { const route = current()?.requestContext(); return route?.provider === 'openai-codex' ? route.model : undefined; };
    const record = (event) => recordUsage(current(), kind, event);
    ctx.effect(() => kind === 'search'
        ? services.web.registerSearchProvider(new CodexWebSearchProvider(ctx.codexRuntime.server, model, record))
        : services.web.registerFetchProvider(new CodexWebFetchProvider(ctx.codexRuntime.server, model, record)), `codex-web-${kind}`);
}
