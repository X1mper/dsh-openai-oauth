/** Schemastery wire envelopes reference the root object by uid. Never match nested fields. */
export function hasSettingsFields(schema: unknown, fields: readonly string[]): boolean {
  if (!schema || typeof schema !== 'object') return false
  const envelope = schema as { uid?: string | number; refs?: Record<string, { type?: string; dict?: Record<string, unknown> }> }
  const root = envelope.uid === undefined ? undefined : envelope.refs?.[envelope.uid]
  return root?.type === 'object' && fields.every(field => Object.hasOwn(root.dict ?? {}, field))
}
export function isCodexCapSchema(schema: unknown): boolean {
  if (!hasSettingsFields(schema, ['thresholdTokens'])) return false
  const envelope = schema as { uid: string | number; refs: Record<string, { type?: string; dict?: Record<string, string | number>; meta?: { description?: unknown } }> }
  const fieldId = envelope.refs[envelope.uid]?.dict?.thresholdTokens
  const field = fieldId === undefined ? undefined : envelope.refs[fieldId]
  return field?.type === 'number' && field.meta?.description === 'Codex pressure compaction token cap'
}
export function selectSettingsId(items: readonly { ns: string }[], selected: string): string | undefined {
  return items.length === 1 ? items[0]?.ns : items.find(item => item.ns === selected)?.ns
}
export const capField = {
  field: 'thresholdTokens',
  format: (value: unknown): string => typeof value === 'number' ? String(value) : '',
  parse: (text: string): { kind: 'clear' } | { kind: 'set'; value: number } | undefined => {
    if (!text.trim()) return { kind: 'clear' }
    const value = Number(text)
    return Number.isSafeInteger(value) && value > 0 ? { kind: 'set', value } : undefined
  },
}
