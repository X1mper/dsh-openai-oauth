import type { Context } from '@deepseek-ai/cordis';
import './runtime.js';
export declare const name = "codex-images";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
