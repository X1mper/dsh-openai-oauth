/** Codex's dynamic-tool schema parser expects one schema in `items`, not a
 * draft-07 positional tuple. Harness retains the original schema for validation.
 * Uniform tuples can be described to the model using a homogeneous array.
 */
export function codexToolSchema(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return value;
    const schema = value;
    const result = { ...schema };
    for (const key of ['properties', 'patternProperties', '$defs', 'definitions']) {
        const entries = schema[key];
        if (entries !== null && typeof entries === 'object' && !Array.isArray(entries)) {
            result[key] = Object.fromEntries(Object.entries(entries).map(([name, item]) => [name, codexToolSchema(item)]));
        }
    }
    for (const key of ['additionalProperties', 'additionalItems', 'contains', 'not', 'if', 'then', 'else']) {
        if (key in schema)
            result[key] = codexToolSchema(schema[key]);
    }
    for (const key of ['anyOf', 'oneOf', 'allOf', 'prefixItems']) {
        if (Array.isArray(schema[key]))
            result[key] = schema[key].map(codexToolSchema);
    }
    if (Array.isArray(schema.items)) {
        const items = schema.items.map(codexToolSchema);
        const unique = [...new Map(items.map(item => [JSON.stringify(item), item])).values()];
        if (unique.length !== 1)
            throw new Error('Codex cannot represent a heterogeneous or empty positional tuple schema');
        result.items = unique[0];
        if (schema.additionalItems === false) {
            result.maxItems = Math.min(typeof schema.maxItems === 'number' ? schema.maxItems : items.length, items.length);
        }
        result.description = [schema.description, `Positional tuple with ${items.length} entries; preserve their original order.`].filter(Boolean).join('\n');
    }
    else if ('items' in schema)
        result.items = codexToolSchema(schema.items);
    return result;
}
