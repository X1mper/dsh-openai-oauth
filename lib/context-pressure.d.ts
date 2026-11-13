/** Durable, heuristic pressure estimate; never use aggregate billing usage. */
export interface PressureSession {
    readonly seq: number;
    eventAt(seq: number): unknown;
    requestHeader(): {
        readonly tools?: readonly unknown[];
        readonly config?: {
            provider?: string;
            model?: string;
        };
    } | undefined;
}
export interface PressureMeasurement {
    readonly surfaceTokens: number;
    readonly nodes: readonly {
        readonly seq: number;
        readonly tokens: number;
    }[];
}
/** Occupancy is a single validated request sample, never a billing sum. */
export declare function validContextSample(usage: any, interrupted: unknown, route?: {
    provider?: string;
    model?: string;
}, source?: {
    provider?: string;
    model?: string;
}): number | null;
export interface ContextPressure {
    totalTokens: number;
    source: 'contextUsage' | 'estimated';
}
/**
 * Samples cover the assistant output. Only subsequently appended surface nodes
 * are added. Replacements, projection/offload events and changed request metadata
 * invalidate the anchor. The fallback is heuristic, not provider billing; tool
 * schemas use the meter's documented four-characters-per-token approximation.
 * Hidden provider overhead and incomplete old logs cannot be reconstructed.
 */
export declare function estimateContextPressure(session: PressureSession, measured: PressureMeasurement): ContextPressure;
