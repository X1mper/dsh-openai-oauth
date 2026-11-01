import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic';
import type { BasicCompactionConfig } from '@deepseek-ai/dsh-compaction-basic';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CompactionTrigger, CompactionResult } from '@deepseek-ai/dsh-compaction';
/** Codex pressure backend for the stock installModelSelection composition. */
export declare class CodexCompactionEngine extends BasicCompactionEngine {
    private readonly assembledRoutes;
    constructor(ctx: Context, config?: BasicCompactionConfig);
    compactIfNeeded(agent: Agent, trigger: CompactionTrigger, signal: AbortSignal): Promise<CompactionResult | null>;
}
export default CodexCompactionEngine;
