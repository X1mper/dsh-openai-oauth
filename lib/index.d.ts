import type { Context } from '@deepseek-ai/cordis';
import './runtime.js';
export { CodexAppServerAdapter } from './adapter.js';
export declare const name = "llm-codex-app-server";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
