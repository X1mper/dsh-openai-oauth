/** Codex's model/list omits capacity; its own fresh catalog supplies the effective limit. */
export declare function cachedModelContext(cache: unknown, model: string, now?: number): number | undefined;
export declare function readModelContext(model: string): Promise<number | undefined>;
