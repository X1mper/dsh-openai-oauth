import { AppServer } from './app-server.js';
export interface SearchSource {
    url: string;
    title?: string;
    snippet?: string;
}
export interface SearchRequest {
    query: string;
    maxResults?: number;
}
export interface SearchResult {
    sources: SearchSource[];
    truncated: boolean;
}
export declare function parseSearchResult(text: string, maxResults?: number): SearchResult;
export declare class CodexWebSearchProvider {
    private readonly server;
    private readonly currentModel;
    private readonly record;
    readonly id = "openai-codex";
    constructor(server: AppServer, currentModel?: () => string | undefined, record?: (event: Record<string, unknown>) => void);
    available(): boolean;
    search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult>;
}
