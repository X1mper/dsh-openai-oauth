import type { Context } from '@deepseek-ai/cordis';
import { z } from 'zod';
declare const viewSchema: z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
    totalTokens: z.ZodNullable<z.ZodNumber>;
    capacity: z.ZodNullable<z.ZodNumber>;
    source: z.ZodEnum<{
        contextUsage: "contextUsage";
        estimated: "estimated";
        unavailable: "unavailable";
    }>;
}, z.core.$strip>;
export type CodexContextView = z.infer<typeof viewSchema>;
declare const stateSchema: z.ZodObject<{
    route: z.ZodNullable<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
    }, z.core.$strip>>;
    context: z.ZodNullable<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        capacity: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    nodes: z.ZodArray<z.ZodObject<{
        seq: z.ZodNumber;
        tokens: z.ZodNumber;
    }, z.core.$strip>>;
    tools: z.ZodNumber;
    surfaceTokens: z.ZodNumber;
    sample: z.ZodNullable<z.ZodNumber>;
    reliable: z.ZodBoolean;
    view: z.ZodNullable<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        totalTokens: z.ZodNullable<z.ZodNumber>;
        capacity: z.ZodNullable<z.ZodNumber>;
        source: z.ZodEnum<{
            contextUsage: "contextUsage";
            estimated: "estimated";
            unavailable: "unavailable";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
type State = z.infer<typeof stateSchema>;
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionStateMap {
        codexContext: State;
    }
    interface SessionProjectionMap {
        codexContext: CodexContextView | null;
    }
}
/** Numeric surface prices only: no conversation text or full log is retained.
 * Fixed-density estimates exclude hidden provider/image overhead. Unknown
 * projection rewrites invalidate fallback instead of displaying stale prices.
 */
export declare const codexContextProjection: {
    key: "codexContext";
    stateVersion: number;
    stateSchema: z.ZodObject<{
        route: z.ZodNullable<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
        }, z.core.$strip>>;
        context: z.ZodNullable<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
            capacity: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>;
        nodes: z.ZodArray<z.ZodObject<{
            seq: z.ZodNumber;
            tokens: z.ZodNumber;
        }, z.core.$strip>>;
        tools: z.ZodNumber;
        surfaceTokens: z.ZodNumber;
        sample: z.ZodNullable<z.ZodNumber>;
        reliable: z.ZodBoolean;
        view: z.ZodNullable<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
            totalTokens: z.ZodNullable<z.ZodNumber>;
            capacity: z.ZodNullable<z.ZodNumber>;
            source: z.ZodEnum<{
                contextUsage: "contextUsage";
                estimated: "estimated";
                unavailable: "unavailable";
            }>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    init: () => {
        route: null;
        context: null;
        nodes: never[];
        tools: number;
        surfaceTokens: number;
        sample: null;
        reliable: true;
        view: null;
    };
    apply(state: State, event: import("@deepseek-ai/dsh-session").SessionEvent): State;
    wire: {
        viewSchema: z.ZodNullable<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
            totalTokens: z.ZodNullable<z.ZodNumber>;
            capacity: z.ZodNullable<z.ZodNumber>;
            source: z.ZodEnum<{
                contextUsage: "contextUsage";
                estimated: "estimated";
                unavailable: "unavailable";
            }>;
        }, z.core.$strip>>;
        view: (state: State) => {
            provider: string;
            model: string;
            totalTokens: number | null;
            capacity: number | null;
            source: "contextUsage" | "estimated" | "unavailable";
        } | null;
    };
};
export declare const name = "codex-context-indicator";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
