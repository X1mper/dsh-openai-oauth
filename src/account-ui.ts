export interface NamedAccount { id: string; name: string; provider: string; aliases?: string[] }
export function accountPath(id: string, suffix = ''): string {
  return '/accounts/' + encodeURIComponent(id) + suffix
}
export function accountIdForProvider(provider: string | undefined, accounts?: NamedAccount[]): string | undefined {
  if (accounts) return accounts.find(a => a.provider === provider || a.aliases?.includes(provider ?? ''))?.id
  if (provider === 'openai-codex') return 'default'
  const match = /^openai-codex-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(provider ?? '')
  return match?.[1]
}
export function safeAuthUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Codex did not return an authentication URL.')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Unsafe authentication URL.')
  return url.href
}
