import test from 'node:test'
import assert from 'node:assert/strict'
import { codexFailure } from '../lib/provider-errors.js'
for (const [info, code] of Object.entries({contextWindowExceeded:'CONTEXT_WINDOW_EXCEEDED',usageLimitExceeded:'QUOTA',sessionBudgetExceeded:'QUOTA',rateLimitExceeded:'RATE_LIMIT',unauthorized:'INVALID_CREDENTIAL',modelNotFound:'UNKNOWN_MODEL',badRequest:'INVALID_REQUEST',serverOverloaded:'SERVER_ERROR'})) {
  test(`Codex ${info} remains machine-routable as ${code}`, () => {
    const error=codexFailure({message:'provider detail',codexErrorInfo:info})
    assert.equal(error.code,code)
    assert.equal(error.message,'provider detail')
    assert.equal(codexFailure(error),error)
  })
}
test('context errors without structured info retain the Harness overflow classifier',()=>{
  assert.equal(codexFailure({message:'maximum context length exceeded'}).code,'CONTEXT_WINDOW_EXCEEDED')
  assert.equal(codexFailure({message:'unknown failure'}).code,'CODEX_ERROR')
})
