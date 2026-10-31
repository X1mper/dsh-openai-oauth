import { Service, type Context } from '@deepseek-ai/cordis';
import { AppServer } from './app-server.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        codexRuntime: CodexRuntime;
    }
}
export declare class CodexRuntime extends Service {
    readonly server: AppServer;
    constructor(ctx: Context);
}
export declare const name = "codex-runtime";
export declare function apply(ctx: Context): Promise<void>;
declare const _default: {
    name: string;
    apply: typeof apply;
};
export default _default;
