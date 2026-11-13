/** Browser-safe route recognition only; identity resolution requires the account registry. */
export function isCodexProvider(provider: string | undefined | null): boolean {
  return typeof provider === 'string' && /^openai-codex(?:-[a-z0-9]+)*$/.test(provider)
}
