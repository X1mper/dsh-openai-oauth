import type { CodexRuntime } from './runtime.js';
export interface ChildModel {
    model: string;
    reasoningEfforts: string[];
}
export type CatalogRuntime = Pick<CodexRuntime, 'accounts' | 'accountServer'>;
/** Deliberately separate from the ordinary LLM provider catalog. Errors never become defaults. */
export declare function commonChildModels(runtime: CatalogRuntime, signal?: AbortSignal): Promise<ChildModel[]>;
