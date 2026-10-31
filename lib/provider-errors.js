import { LlmError, CONTEXT_WINDOW_EXCEEDED_CODE, isContextWindowExceededError, isQuotaExceededError } from '@deepseek-ai/dsh-llm';
/** Preserve machine-readable provider failures so Harness recovery plugins can route them. */
export function codexFailure(value) {
    if (value instanceof LlmError)
        return value;
    const detail = value !== null && typeof value === 'object' ? value : {};
    const message = typeof detail.message === 'string' ? detail.message : 'Codex request failed';
    const data = detail.data !== null && typeof detail.data === 'object' ? detail.data : {};
    const info = detail.codexErrorInfo ?? data.codexErrorInfo;
    const codes = {
        contextWindowExceeded: CONTEXT_WINDOW_EXCEEDED_CODE,
        usageLimitExceeded: 'QUOTA', sessionBudgetExceeded: 'QUOTA',
        rateLimitExceeded: 'RATE_LIMIT', unauthorized: 'INVALID_CREDENTIAL',
        modelNotFound: 'UNKNOWN_MODEL', badRequest: 'INVALID_REQUEST',
        serverOverloaded: 'SERVER_ERROR', internalServerError: 'SERVER_ERROR',
    };
    const structured = typeof info === 'string' ? codes[info] : undefined;
    const diagnostic = [detail.code, detail.type, data.code, data.type, message].filter(v => typeof v === 'string').join(' ');
    const code = structured ?? (isContextWindowExceededError(diagnostic) ? CONTEXT_WINDOW_EXCEEDED_CODE
        : isQuotaExceededError(diagnostic) ? 'QUOTA' : 'CODEX_ERROR');
    return new LlmError(message, code);
}
