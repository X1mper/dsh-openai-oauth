/** Non-Codex callers keep the global default; named Codex routes never fall back. */
export declare function routeAccountId(provider?: string, resolve?: (provider: string) => string): string;
export declare function isCodexAccountRoute(provider?: string): boolean;
