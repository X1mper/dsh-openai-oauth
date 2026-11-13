import { validAccountId } from './accounts.js'
/** Non-Codex callers keep the global default; named Codex routes never fall back. */
export function routeAccountId(provider?: string, resolve?: (provider: string) => string): string {
  if (provider && isCodexAccountRoute(provider) && resolve) return resolve(provider)
  if (!provider || provider === 'openai-codex' || !provider.startsWith('openai-codex-')) return 'default'
  const id = provider.slice('openai-codex-'.length)
  if (id === 'default' || !validAccountId(id)) throw new Error('Invalid Codex account route')
  return id
}
export function isCodexAccountRoute(provider?: string): boolean {
  return provider === 'openai-codex' || Boolean(provider?.startsWith('openai-codex-'))
}
