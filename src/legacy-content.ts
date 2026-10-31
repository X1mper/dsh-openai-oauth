import type { ContentBlock } from '@deepseek-ai/dsh-llm'
/** Read historical 0.1 logs without emitting their obsolete block shape. */
export interface LegacyToolResult {
  type: 'tool-result'
  toolCallId: string
  content: readonly ReadableBlock[]
  isError?: boolean
}
export type ReadableBlock = ContentBlock | LegacyToolResult
export function isLegacyToolResult(block: unknown): block is LegacyToolResult {
  return block !== null && typeof block === 'object' && (block as {type?:unknown}).type === 'tool-result'
}
