import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { recordUsage } from '../lib/session-records.js'

test('uninitialized optional record API never falls back to mandatory session.append', () => {
  let called = false
  recordUsage({ append() { called = true } }, 'image', { completed: true })
  assert.equal(called, false)
})

test('repair preserves event coordinates and payload, leaves other rows byte-identical, and is idempotent', () => {
  const script = `
import runpy,json
repair=runpy.run_path('scripts/repair-session-records.py')['transform']
header=b'{"type":"session","version":4,"id":"fixture"}\\n'
message=b'{ "type": "user/message", "seq": 0, "time": 1, "data": {"text":"keep me"} }\\n'
old={"type":"image/codex-llm-request","seq":1,"time":2,"data":{"usage":{"totalTokens":7}}}
raw=header+message+json.dumps(old).encode()+b'\\n'
out,count=repair(raw)
assert count==1 and out.startswith(header+message)
new=json.loads(out.splitlines()[-1])
assert new.pop('ignorable') is True
assert new.pop('type')=='plugin:dsh-openai-oauth/image-llm-request'
old.pop('type')
assert new==old
assert repair(out)==(out,0)
try:
 repair(header+json.dumps({"type":"image/codex-llm-request","surfaceOp":{}}).encode())
except ValueError: pass
else: raise AssertionError('surface mutation accepted')
`
  const result = spawnSync('python3', ['-c', script], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})
