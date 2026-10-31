export type UsageRecordKind = 'image' | 'search' | 'fetch';
export declare const USAGE_RECORD_TYPES: {
    readonly image: "plugin:dsh-openai-oauth/image-llm-request";
    readonly search: "plugin:dsh-openai-oauth/search-llm-request";
    readonly fetch: "plugin:dsh-openai-oauth/fetch-llm-request";
};
/** Load the host peer once at plugin activation, not in standalone adapters. */
export declare function initializeSessionRecords(): Promise<void>;
/** Optional diagnostics must never become mandatory session-format events.
 * Older hosts without plugin records omit this audit rather than poison logs.
 */
export declare function recordUsage(session: unknown, kind: UsageRecordKind, data: Record<string, unknown>): void;
