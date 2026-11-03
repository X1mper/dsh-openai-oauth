import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { codexFailure } from '../lib/provider-errors.js'
for (const [info, code] of Object.entries({contextWindowExceeded:'CONTEXT_WINDOW_EXCEEDED',usageLimitExceeded:'QUOTA',sessionBudgetExceeded:'QUOTA',rateLimitExceeded:'RATE_LIMIT',unauthorized:'INVALID_CREDENTIAL',modelNotFound:'UNKNOWN_MODEL',badRequest:'INVALID_REQUEST',serverOverloaded:'SERVER',internalServerError:'SERVER'})) {
  test(`Codex ${info} remains machine-routable as ${code}`, () => {
    const error=codexFailure({message:'provider detail',codexErrorInfo:info})
    assert.equal(error.code,code)
    assert.equal(error.message,'provider detail')
    assert.equal(codexFailure(error),error)
  })
}
test('normal retry policy handles structured server errors but not permanent or unknown errors', () => {
  const codes = resolveRetryPolicy(undefined, 'test').retryableCodes
  for (const info of ['serverOverloaded', 'internalServerError']) {
    assert.equal(codexFailure({ message: 'failure', data: { codexErrorInfo: info } }).code, 'SERVER')
    assert.ok(codes.includes(codexFailure({ message: 'failure', data: { codexErrorInfo: info } }).code))
  }
  for (const info of ['unauthorized', 'modelNotFound', 'badRequest', 'unknown']) {
    assert.ok(!codes.includes(codexFailure({ message: 'failure', codexErrorInfo: info }).code))
  }
})
test('context errors without structured info retain the Harness overflow classifier',()=>{
  assert.equal(codexFailure({message:'maximum context length exceeded'}).code,'CONTEXT_WINDOW_EXCEEDED')
  assert.equal(codexFailure({message:'unknown failure'}).code,'CODEX_ERROR')
})
