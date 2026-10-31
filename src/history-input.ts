import { LlmError } from '@deepseek-ai/dsh-llm'

// Codex validates the SUM of text inputs, not each array element. Leave
// headroom below its 1,048,576-character transport ceiling. Actual context
// pressure is handled by Harness and provider CONTEXT_WINDOW_EXCEEDED errors.
export const TRANSPORT_INPUT_BUDGET = 1_000_000

// Separate work budget for auxiliary summaries; never use as a normal-input cap.
export const INPUT_BUDGET = 200_000
export const HISTORY_CHUNK = 120_000
export const VERBATIM_TAIL = 60_000
export const SUMMARY_BUDGET = 16_000

export function splitText(text: string, size: number): string[] {
  if (!Number.isSafeInteger(size) || size < 2) throw new RangeError('Text chunk size must be an integer >= 2')
  const parts: string[] = []
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + size, text.length)
    // Never cut a UTF-16 surrogate pair (JSON transport must stay lossless).
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--
    parts.push(text.slice(start, end))
    start = end
  }
  return parts
}

export async function boundedInput(
  text: string,
  summarize: (fragment: string, position: string) => Promise<string>,
  signal?: AbortSignal,
): Promise<string> {
  const steps = recoverySteps(text, summarize, signal)
  while (true) {
    const step = await steps.next()
    if (step.done) return step.value
  }
}

/** Yields progress BEFORE slow model work; never silently truncates data. */
export async function* recoverySteps(
  text: string,
  summarize: (fragment: string, position: string) => Promise<string>,
  signal?: AbortSignal,
): AsyncGenerator<string, string> {
  if (text.length <= INPUT_BUDGET) return text
  let cut = text.length - VERBATIM_TAIL
  if (/[\uD800-\uDBFF]/.test(text[cut - 1]!)) cut--
  const tail = text.slice(cut)
  let older = text.slice(0, cut)
  // Preserve the latest suffix verbatim, including a full trailing surrogate pair.
  const originalLength = text.length
  for (let level = 0; level < 8; level++) {
    const chunks = splitText(older, HISTORY_CHUNK)
    const summaries: string[] = []
    for (const [index, chunk] of chunks.entries()) {
      signal?.throwIfAborted()
      const position = `level ${level + 1}, fragment ${index + 1}/${chunks.length}`
      yield `Восстановление истории: ${position}. Сжимаю старые сообщения; исходный журнал сохранён.\n`
      signal?.throwIfAborted()
      const summary = await summarize(chunk, position)
      signal?.throwIfAborted()
      if (!summary.trim() || summary.length > SUMMARY_BUDGET) {
        throw new LlmError('History summary was empty or exceeded its safe budget; original Harness history is unchanged. Retry compaction.', 'INVALID_REQUEST')
      }
      summaries.push(`[Fragment ${index + 1}/${chunks.length}]\n${summary}`)
    }
    const reduced = summaries.join('\n\n')
    const result = [
      `[Harness history recovery: input of ${originalLength} characters exceeded the safe input budget. Earlier text was semantically summarized, NOT replayed verbatim. Summaries may omit details; consult the durable Harness log before claiming exact old outputs. Historical tool calls already ran; do not execute them again.]`,
      '<earlier-history-summary>', reduced, '</earlier-history-summary>',
      '[Verbatim most recent input suffix follows; it may begin inside a historical JSON fragment. Continue only the last current request, respecting the system instructions.]',
      tail,
    ].join('\n\n')
    if (result.length <= INPUT_BUDGET) return result
    if (reduced.length >= older.length) break
    older = reduced
  }
  throw new LlmError('History could not be reduced safely; original Harness history is unchanged.', 'INVALID_REQUEST')
}
