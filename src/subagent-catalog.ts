import type { CodexRuntime } from './runtime.js'

export interface ChildModel { model: string; reasoningEfforts: string[] }
export type CatalogRuntime = Pick<CodexRuntime, 'accounts' | 'accountServer'>
/** Deliberately separate from the ordinary LLM provider catalog. Errors never become defaults. */
export async function commonChildModels(runtime: CatalogRuntime, signal?: AbortSignal): Promise<ChildModel[]> {
  const catalogs: ChildModel[][] = []
  for (const account of runtime.accounts.list()) {
    signal?.throwIfAborted()
    const server = runtime.accountServer(account.id)
    const auth = await server.account(false)
    if (!auth || auth.type !== 'chatgpt') continue
    const rows = await server.models()
    if (!Array.isArray(rows)) throw new Error('Invalid Codex model catalog')
    const catalog = rows.filter(row => row.hidden !== true).map(row => {
      const model = row.model ?? row.id
      const efforts = row.supportedReasoningEfforts
      if (typeof model !== 'string' || !model || !Array.isArray(efforts)) throw new Error('Invalid Codex model catalog')
      const reasoningEfforts = efforts.map((entry: any) => {
        if (!entry || typeof entry.reasoningEffort !== 'string') throw new Error('Invalid Codex effort catalog')
        return entry.reasoningEffort
      })
      return { model, reasoningEfforts: [...new Set<string>(reasoningEfforts)] }
    })
    if (new Set(catalog.map(row => row.model)).size !== catalog.length) throw new Error('Duplicate Codex model catalog entry')
    catalogs.push(catalog)
  }
  signal?.throwIfAborted()
  if (!catalogs.length) return []
  return catalogs[0].flatMap(row => {
    const matches = catalogs.map(catalog => catalog.find(item => item.model === row.model))
    if (matches.some(match => !match)) return []
    return [{ model: row.model, reasoningEfforts: row.reasoningEfforts.filter(effort => matches.every(match => match!.reasoningEfforts.includes(effort))) }]
  })
}
