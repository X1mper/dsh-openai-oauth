import type { TokenUsage } from '@deepseek-ai/dsh-llm';
declare const counters: readonly ["inputTokens", "cachedInputTokens", "cacheWriteInputTokens", "outputTokens", "reasoningOutputTokens", "totalTokens"];
type Counter = typeof counters[number];
type Snapshot = Record<Counter, number>;
/** Convert cumulative thread counters to disjoint, once-only Harness call usage. */
export declare class CodexUsageTracker {
    private latest;
    private reported;
    checkpoint(): Snapshot;
    restore(value: unknown): boolean;
    update(tokenUsage: unknown): void;
    take(): (TokenUsage & {
        totalTokens: number;
    }) | undefined;
}
export {};
