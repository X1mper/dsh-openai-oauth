/** Schemastery wire envelopes reference the root object by uid. Never match nested fields. */
export function hasSettingsFields(schema, fields) {
    if (!schema || typeof schema !== 'object')
        return false;
    const envelope = schema;
    const root = envelope.uid === undefined ? undefined : envelope.refs?.[envelope.uid];
    return root?.type === 'object' && fields.every(field => Object.hasOwn(root.dict ?? {}, field));
}
export function isCodexCapSchema(schema) {
    if (!hasSettingsFields(schema, ['thresholdTokens']))
        return false;
    const envelope = schema;
    const fieldId = envelope.refs[envelope.uid]?.dict?.thresholdTokens;
    const field = fieldId === undefined ? undefined : envelope.refs[fieldId];
    return field?.type === 'number' && field.meta?.description === 'Codex pressure compaction token cap';
}
export function selectSettingsId(items, selected) {
    return items.length === 1 ? items[0]?.ns : items.find(item => item.ns === selected)?.ns;
}
export const capField = {
    field: 'thresholdTokens',
    format: (value) => typeof value === 'number' ? String(value) : '',
    parse: (text) => {
        if (!text.trim())
            return { kind: 'clear' };
        const value = Number(text);
        return Number.isSafeInteger(value) && value > 0 ? { kind: 'set', value } : undefined;
    },
};
