import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic';
import type { BasicCompactionConfig } from '@deepseek-ai/dsh-compaction-basic';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CompactionTrigger, CompactionResult } from '@deepseek-ai/dsh-compaction';
import Schema from '@deepseek-ai/schemastery';
type LiveThreshold = number | {
    get(): number | undefined;
};
export type CodexCompactionConfig = BasicCompactionConfig & {
    thresholdTokens?: LiveThreshold;
};
/** Codex pressure backend for the stock installModelSelection composition. */
export declare class CodexCompactionEngine extends BasicCompactionEngine {
    private readonly assembledRoutes;
    static Config: Schema<BasicCompactionConfig & {
        thresholdTokens?: number;
    }, CodexCompactionConfig>;
    private readonly thresholdTokens?;
    constructor(ctx: Context, config?: CodexCompactionConfig);
    compactIfNeeded(agent: Agent, trigger: CompactionTrigger, signal: AbortSignal): Promise<CompactionResult | null>;
}
export default CodexCompactionEngine;
