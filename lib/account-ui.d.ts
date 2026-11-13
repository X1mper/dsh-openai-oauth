export interface NamedAccount {
    id: string;
    name: string;
    provider: string;
    aliases?: string[];
}
export declare function accountPath(id: string, suffix?: string): string;
export declare function accountIdForProvider(provider: string | undefined, accounts?: NamedAccount[]): string | undefined;
export declare function safeAuthUrl(value: unknown): string;
