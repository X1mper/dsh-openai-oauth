import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "codex-context-policy";
export declare const inject: string[];
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    idleMinutes: z<number, number, "volatile-defined">;
    minHistoryTokens: z<number, number, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    idleMinutes: z<number, number, "volatile-defined">;
    minHistoryTokens: z<number, number, "volatile-defined">;
}>>, "plain">;
export interface ContextPolicyConfig {
    idleMinutes?: number;
    minHistoryTokens?: number;
}
interface LogEvent {
    type: string;
    seq: number;
    time: number;
}
interface PolicySession {
    seq: number;
    eventAt(seq: number): LogEvent | undefined;
    requestContext(): {
        provider?: string;
    } | undefined;
}
/** Inspect durable activity; a restarted plugin must not repeat compaction in the same turn. */
export declare function idleHistory(session: PolicySession, now: number, idleMinutes: number): boolean;
type LiveNumber = {
    get(): number;
};
interface LiveConfig {
    idleMinutes?: number | LiveNumber;
    minHistoryTokens?: number | LiveNumber;
}
export declare function apply(ctx: Context, config?: LiveConfig): void;
declare const _default: {
    name: string;
    inject: string[];
    Config: z<Schemastery.ObjectS<NoInfer<{
        idleMinutes: z<number, number, "volatile-defined">;
        minHistoryTokens: z<number, number, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        idleMinutes: z<number, number, "volatile-defined">;
        minHistoryTokens: z<number, number, "volatile-defined">;
    }>>, "plain">;
    apply: typeof apply;
};
export default _default;
