import './runtime.js';
import { applyImageTools } from './image-generation.js';
export const name = 'codex-images';
export const inject = ['codexRuntime', 'attachments', 'tools'];
export function apply(ctx) { applyImageTools(ctx, ctx.codexRuntime.server); }
export default { name, inject, apply };
