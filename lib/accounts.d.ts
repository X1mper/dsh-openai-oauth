export interface CodexAccount {
    id: string;
    name: string;
    provider: string;
    aliases: string[];
}
export declare function validAccountId(id: string): boolean;
/** Legacy route, retained for replay compatibility, not the primary user route. */
export declare function accountProvider(id: string): string;
export declare function accountHome(id: string, home?: string): string;
export declare function accountSlug(label: string): string;
export declare class AccountRegistry {
    readonly home: string;
    private entries;
    private queue;
    constructor(home?: string);
    load(): Promise<void>;
    list(): CodexAccount[];
    get(id: string): CodexAccount;
    resolveProvider(provider: string): string;
    private change;
    create(value: unknown): Promise<CodexAccount>;
    rename(id: string, value: unknown): Promise<CodexAccount>;
    delete(id: string): Promise<void>;
}
