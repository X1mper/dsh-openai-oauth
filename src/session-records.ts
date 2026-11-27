export type UsageRecordKind = 'image' | 'search' | 'fetch'
export const USAGE_RECORD_TYPES = {
  image: 'plugin:dsh-openai-oauth/image-llm-request',
  search: 'plugin:dsh-openai-oauth/search-llm-request',
  fetch: 'plugin:dsh-openai-oauth/fetch-llm-request',
} as const

type AppendRecord = (session: unknown, type: string, data: Record<string, unknown>) => unknown
let append: AppendRecord | undefined

/** Load the host peer once at plugin activation, not in standalone adapters. */
export async function initializeSessionRecords(): Promise<void> {
  const api = await import('@deepseek-ai/dsh-session')
  append = (api as unknown as { appendPluginRecord?: AppendRecord }).appendPluginRecord
}

/** Optional diagnostics must never become mandatory session-format events.
 * Older hosts without plugin records omit this audit rather than poison logs.
 */
export function recordUsage(session: unknown, kind: UsageRecordKind, data: Record<string, unknown>): void {
  if (session !== undefined && typeof append === 'function') append(session, USAGE_RECORD_TYPES[kind], Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ))
}
