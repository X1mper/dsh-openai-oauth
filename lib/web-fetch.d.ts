import { AppServer } from './app-server.js';
export interface FetchRequest {
    url: string;
}
export interface FetchResult {
    url: string;
    statusCode: number;
    body: {
        kind: 'text';
        content: string;
    };
    truncated: boolean;
}
/** Codex extraction, not a raw HTTP transport. Status 0 means not exposed. */
export declare class CodexWebFetchProvider {
    private readonly server;
    private readonly currentModel;
    private readonly record;
    readonly id = "openai-codex";
    constructor(server: AppServer, currentModel?: () => string | undefined, record?: (event: Record<string, unknown>) => void);
    available(): boolean;
    fetch(request: FetchRequest, signal?: AbortSignal): Promise<FetchResult>;
}
