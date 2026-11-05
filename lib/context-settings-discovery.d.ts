/** Schemastery wire envelopes reference the root object by uid. Never match nested fields. */
export declare function hasSettingsFields(schema: unknown, fields: readonly string[]): boolean;
export declare function isCodexCapSchema(schema: unknown): boolean;
export declare function selectSettingsId(items: readonly {
    ns: string;
}[], selected: string): string | undefined;
export declare const capField: {
    field: string;
    format: (value: unknown) => string;
    parse: (text: string) => {
        kind: "clear";
    } | {
        kind: "set";
        value: number;
    } | undefined;
};
