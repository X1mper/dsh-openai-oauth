import { registerWeb } from './component-web.js';
export const name = 'codex-web-search';
export const inject = ['codexRuntime', 'web'];
export function apply(ctx) { registerWeb(ctx, 'search'); }
export default { name, inject, apply };
