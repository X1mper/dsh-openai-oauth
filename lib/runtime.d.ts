import { Service, type Context } from '@deepseek-ai/cordis';
import { AppServer } from './app-server.js';
import { AccountRegistry } from './accounts.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        codexRuntime: CodexRuntime;
    }
}
export declare class CodexRuntime extends Service {
    readonly accounts: AccountRegistry;
    readonly server: AppServer;
    private readonly servers;
    private readonly listeners;
    constructor(ctx: Context);
    accountIdForProvider(provider?: string): string;
    providerServer(provider?: string): AppServer;
    accountServer(id: string): AppServer;
    subscribe(fn: () => void): () => void;
    changed(): void;
}
export declare const name = "codex-runtime";
export declare function apply(ctx: Context): Promise<void>;
declare const _default: {
    name: string;
    apply: typeof apply;
};
export default _default;
