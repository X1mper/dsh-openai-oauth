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
  const writer = (api as unknown as { appendPluginRecord?: AppendRecord }).appendPluginRecord
  // A profile can resolve a second copy of dsh-session. Its writer uses a
  // private Session method and cannot append to the host's Session instance.
  append = typeof writer === 'function' ? (session, type, data) => {
    if (session instanceof api.Session) writer(session, type, data)
  } : undefined
}

/** Optional diagnostics must never become mandatory session-format events.
 * Older hosts without plugin records omit this audit rather than poison logs.
 */
export function recordUsage(session: unknown, kind: UsageRecordKind, data: Record<string, unknown>): void {
  if (session !== undefined && typeof append === 'function') append(session, USAGE_RECORD_TYPES[kind], Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ))
}
