import { toolPairingBalancedBefore } from '@deepseek-ai/dsh-compaction';
import type { Session, SessionSeq } from '@deepseek-ai/dsh-session';
import type { ResolvedConfig, CompactionPolicyConfig } from '@deepseek-ai/dsh-compaction-basic';
/** Merge only the exact route policy; base configuration is validated by Basic. */
export declare function policyFor(config: ResolvedConfig, target: {
    provider: string;
    model: string;
}): {
    thresholdRatio: number;
    headroomTokens: number;
    retainRatio: number;
    retainTokens?: number | undefined;
    summarizationProvider: string;
    summarizationModel: string;
    maxTokens: number;
    compactionRetries: number;
    maxOverflowRetries: number;
    modelPolicies: readonly Readonly<import("@deepseek-ai/dsh-compaction-basic").ModelCompactPolicyConfig>[];
    auto: boolean;
} | {
    thresholdRatio: number;
    headroomTokens: number;
    retainRatio?: number | undefined;
    retainTokens: number;
    summarizationProvider: string;
    summarizationModel: string;
    maxTokens: number;
    compactionRetries: number;
    maxOverflowRetries: number;
    modelPolicies: readonly Readonly<import("@deepseek-ai/dsh-compaction-basic").ModelCompactPolicyConfig>[];
    auto: boolean;
};
export declare function budgets(policy: CompactionPolicyConfig, capacity: number, output: number): {
    threshold: number;
    retain: number;
};
export declare function selectRange(session: Session, nodes: readonly {
    seq: SessionSeq;
    tokens: number;
}[], retain: number, balanced?: typeof toolPairingBalancedBefore): {
    start: SessionSeq;
    end: SessionSeq;
} | null;
