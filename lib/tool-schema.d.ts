/** Codex's dynamic-tool schema parser expects one schema in `items`, not a
 * draft-07 positional tuple. Harness retains the original schema for validation.
 * Uniform tuples can be described to the model using a homogeneous array.
 */
export declare function codexToolSchema(value: unknown): unknown;
