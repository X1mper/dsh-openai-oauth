import test from 'node:test'
import assert from 'node:assert/strict'
import { accountPath, accountIdForProvider, safeAuthUrl } from '../lib/account-ui.js'
test('default route retained and account paths encoded', () => {
 assert.equal(accountPath('default', '/login'), '/accounts/default/login')
 assert.equal(accountPath('a/b', '/limits'), '/accounts/a%2Fb/limits')
})
test('only explicit Codex account routes accepted', () => {
 const id = '12345678-1234-1234-1234-123456789abc'
 assert.equal(accountIdForProvider('openai-codex'), 'default')
 assert.equal(accountIdForProvider('openai-codex-' + id), id)
 for (const p of ['openai', 'openai-codex-evil', undefined]) assert.equal(accountIdForProvider(p), undefined)
})
test('login URL cannot execute scripts or expose embedded credentials', () => {
 assert.equal(safeAuthUrl('https://auth.openai.com/login'), 'https://auth.openai.com/login')
 for (const url of ['javascript:alert(1)', 'data:text/html,x', 'http://example.com', 'https://user:pass@example.com', undefined]) assert.throws(() => safeAuthUrl(url))
})
