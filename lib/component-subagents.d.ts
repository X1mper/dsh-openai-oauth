import type { Context } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { defineTool as publicDefineTool } from '@deepseek-ai/dsh-tools';
import { parentAgentOptionsForDelegation as publicParentOptions } from '@deepseek-ai/dsh-subagent';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { type CatalogRuntime } from './subagent-catalog.js';
import './runtime.js';
export declare const name = "codex-subagent-tools";
export declare const inject: string[];
export declare const Config: z.ZodObject<{
    toolName: z.ZodDefault<z.ZodString>;
    catalogToolName: z.ZodDefault<z.ZodUnion<readonly [z.ZodString, z.ZodLiteral<false>]>>;
    provider: z.ZodDefault<z.ZodString>;
    agentPreset: z.ZodOptional<z.ZodString>;
    agentOptions: z.ZodOptional<z.ZodObject<{
        model: z.ZodOptional<z.ZodString>;
        reasoningEffort: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    maxDepth: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type Config = z.infer<typeof Config>;
/** Snapshot the active parent route before asynchronous discovery. The returned concrete route is durable child state. */
export declare function childOptions(runtime: CatalogRuntime, parentOptions: {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
}, configured?: Config['agentOptions'], requested?: {
    model?: string;
    reasoning_effort?: string;
}, signal?: AbortSignal): Promise<{
    reasoningEffort?: ReasoningEffortId | undefined;
    provider: string;
    model: string;
}>;
export declare function apply(ctx: Context, raw: Config): Promise<void>;
/** Public-API adapter separated for offline integration tests. */
export declare function registerSubagentTools(ctx: Context, config: Config, api: {
    defineTool: typeof publicDefineTool;
    parentAgentOptionsForDelegation: typeof publicParentOptions;
}): void;
declare const _default: {
    name: string;
    inject: string[];
    Config: z.ZodObject<{
        toolName: z.ZodDefault<z.ZodString>;
        catalogToolName: z.ZodDefault<z.ZodUnion<readonly [z.ZodString, z.ZodLiteral<false>]>>;
        provider: z.ZodDefault<z.ZodString>;
        agentPreset: z.ZodOptional<z.ZodString>;
        agentOptions: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            reasoningEffort: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        maxDepth: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
    apply: typeof apply;
};
export default _default;
