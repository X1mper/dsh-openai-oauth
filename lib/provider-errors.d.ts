import { LlmError } from '@deepseek-ai/dsh-llm';
/** Preserve machine-readable provider failures so Harness recovery plugins can route them. */
export declare function codexFailure(value: unknown): LlmError;
