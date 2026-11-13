import test from 'node:test'
import assert from 'node:assert/strict'
import { isCodexProvider } from '../lib/codex-route.js'
const named = 'openai-codex-01234567-89ab-4cde-8fab-0123456789ab'
test('Codex route recognition accepts safe slugs and legacy aliases without resolving identity', () => {
  // Recognition is browser-safe syntax only; the runtime registry resolves identity.
  for (const route of ['openai-codex', named, 'openai-codex-work', 'openai-codex-rabochiy-2', named + '-suffix']) assert.equal(isCodexProvider(route), true)
  for (const route of [undefined, null, '', 'other', 'openai-codex-', 'openai-codex--work', 'openai-codex-Work', 'openai-codex-a/b', 'openai-codex-../work', 'openai-codex-work account', 'openai-codex-work_2']) assert.equal(isCodexProvider(route), false)
})
