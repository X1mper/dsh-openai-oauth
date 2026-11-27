export const USAGE_RECORD_TYPES = {
    image: 'plugin:dsh-openai-oauth/image-llm-request',
    search: 'plugin:dsh-openai-oauth/search-llm-request',
    fetch: 'plugin:dsh-openai-oauth/fetch-llm-request',
};
let append;
/** Load the host peer once at plugin activation, not in standalone adapters. */
export async function initializeSessionRecords() {
    const api = await import('@deepseek-ai/dsh-session');
    append = api.appendPluginRecord;
}
/** Optional diagnostics must never become mandatory session-format events.
 * Older hosts without plugin records omit this audit rather than poison logs.
 */
export function recordUsage(session, kind, data) {
    if (session !== undefined && typeof append === 'function')
        append(session, USAGE_RECORD_TYPES[kind], Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
}
