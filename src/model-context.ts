import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { codexHome } from './paths.js'

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

/** Codex's model/list omits capacity; its own fresh catalog supplies the effective limit. */
export function cachedModelContext(cache: unknown, model: string, now = Date.now()): number | undefined {
  if (cache === null || typeof cache !== 'object') return
  const data = cache as Record<string, unknown>
  const fetched = typeof data.fetched_at === 'string' ? Date.parse(data.fetched_at) : NaN
  if (!Number.isFinite(fetched) || fetched > now + 60_000 || now - fetched > 24 * 60 * 60_000 || !Array.isArray(data.models)) return
  const entry = data.models.find(m => m !== null && typeof m === 'object' && m.slug === model)
  if (!entry || !positive(entry.context_window)) return
  const percent = entry.effective_context_window_percent ?? 100
  if (!positive(percent) || percent > 100) return
  const effective = Math.floor(entry.context_window * percent / 100)
  return positive(effective) ? effective : undefined
}

export async function readModelContext(model: string): Promise<number | undefined> {
  try { return cachedModelContext(JSON.parse(await readFile(join(codexHome(), 'models_cache.json'), 'utf8')), model) }
  catch { return undefined }
}
