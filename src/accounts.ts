import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { codexHome } from './paths.js'
export interface CodexAccount { id: string; name: string; provider: string; aliases: string[] }
export function validAccountId(id: string): boolean { return id === 'default' || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) }
/** Legacy route, retained for replay compatibility, not the primary user route. */
export function accountProvider(id: string): string { if (!validAccountId(id)) throw new Error('Invalid account id'); return id === 'default' ? 'openai-codex' : 'openai-codex-' + id }
export function accountHome(id: string, home = codexHome()): string { accountProvider(id); return id === 'default' ? home : join(home, 'accounts', id) }
function name(value: unknown): string { if (typeof value !== 'string' || !value.trim() || value.trim().length > 80 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Account name must be 1–80 printable characters'); return value.trim() }
const russian = Object.fromEntries(Array.from('абвгдеёжзийклмнопрстуфхцчшщъыьэюя').map((c,i) => [c, ['a','b','v','g','d','e','yo','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','kh','ts','ch','sh','shch','','y','','e','yu','ya'][i]]))
export function accountSlug(label: string): string { return Array.from(label.toLowerCase()).map(c => russian[c] ?? c).join('').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/,'') || 'account' }
function primary(label: string, entries: CodexAccount[], id: string): string {
  const slug = accountSlug(label)
  const base = 'openai-codex-' + (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(slug) ? 'account-' + slug : slug)
  const occupied = new Set(entries.filter(e => e.id !== id).flatMap(e => [e.provider, ...e.aliases]))
  // UUID-shaped names must not impersonate the legacy identity namespace.
  let candidate = base; let n = 2
  while (occupied.has(candidate)) candidate = base + '-' + n++
  return candidate
}
/** Deleted rows are durable route reservations and never exposed by list/get/resolve. */
type RegistryAccount = CodexAccount & { deleted?: true }
export class AccountRegistry {
  private entries: RegistryAccount[] = [{ id: 'default', name: 'Default', provider: 'openai-codex-default', aliases: ['openai-codex'] }]
  private queue: Promise<unknown> = Promise.resolve()
  constructor(readonly home = codexHome()) {}
  async load(): Promise<void> {
    try {
      const data: unknown = JSON.parse(await readFile(join(this.home, 'accounts.json'), 'utf8'))
      if (!Array.isArray(data)) throw new Error('Invalid account registry')
      const seen = new Set<string>(); const entries: RegistryAccount[] = []
      for (const item of data) {
        if (!item || !validAccountId(item.id) || seen.has(item.id)) throw new Error('Invalid account registry')
        if (item.deleted !== undefined && item.deleted !== true || item.id === 'default' && item.deleted) throw new Error('Invalid account tombstone')
        seen.add(item.id)
        const label = name(item.name)
        const provider = typeof item.provider === 'string' && /^openai-codex-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.provider) && item.provider !== accountProvider(item.id) ? item.provider : primary(label, [...entries, ...data.filter(e => e && validAccountId(e.id)).map(e => ({ id: e.id, name: '', provider: accountProvider(e.id), aliases: [typeof e.provider === 'string' ? e.provider : accountProvider(e.id), ...(Array.isArray(e.aliases) ? e.aliases : [])] }))], item.id)
        const aliases = [...new Set([accountProvider(item.id), ...(Array.isArray(item.aliases) ? item.aliases : [])])].filter(a => a !== provider)
        if (aliases.some(a => typeof a !== 'string' || !/^openai-codex(?:-[a-z0-9]+)*$/.test(a))) throw new Error('Invalid account alias')
        entries.push({ id: item.id, name: label, provider, aliases, ...(item.deleted ? { deleted: true as const } : {}) })
      }
      if (!seen.has('default')) throw new Error('Missing default account')
      const routes = new Set<string>()
      for (const entry of entries) for (const route of [entry.provider, ...entry.aliases]) { if (routes.has(route)) throw new Error('Duplicate account route'); routes.add(route) }
      this.entries = entries
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  list(): CodexAccount[] { return this.entries.filter(item => !item.deleted).map(({ deleted: _deleted, ...item }) => ({ ...item, aliases: [...item.aliases] })) }
  get(id: string): CodexAccount { accountProvider(id); const entry = this.list().find(item => item.id === id); if (!entry) throw new Error('Unknown account'); return entry }
  resolveProvider(provider: string): string { const entry = this.entries.find(e => !e.deleted && (e.provider === provider || e.aliases.includes(provider))); if (!entry) throw new Error('Unknown Codex account route'); return entry.id }
  private change<T>(update: (entries: RegistryAccount[]) => T): Promise<T> {
    const result = this.queue.then(async () => {
      const entries = this.entries.map(item => ({ ...item, aliases: [...item.aliases] })); const value = update(entries)
      await mkdir(this.home, { recursive: true, mode: 0o700 })
      const tmp = join(this.home, 'accounts.' + randomUUID() + '.tmp')
      await writeFile(tmp, JSON.stringify(entries), { mode: 0o600 })
      await rename(tmp, join(this.home, 'accounts.json')); this.entries = entries; return value
    })
    this.queue = result.catch(() => {}); return result
  }
  create(value: unknown): Promise<CodexAccount> { const label = name(value); return this.change(entries => { const id = randomUUID(); const item = { id, name: label, provider: primary(label, entries, id), aliases: [accountProvider(id)] }; entries.push(item); return { ...item, aliases: [...item.aliases] } }) }
  rename(id: string, value: unknown): Promise<CodexAccount> { const label = name(value); return this.change(entries => { this.get(id); const item = entries.find(item => item.id === id)!; const provider = primary(label, entries, id); item.aliases = [...new Set([...item.aliases, item.provider])].filter(a => a !== provider); item.provider = provider; item.name = label; return { ...item, aliases: [...item.aliases] } }) }
  delete(id: string): Promise<void> { return this.change(entries => { this.get(id); if (id === 'default') throw new Error('Cannot delete default account'); entries.find(item => item.id === id)!.deleted = true }) }
}
