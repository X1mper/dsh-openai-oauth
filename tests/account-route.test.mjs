import test from 'node:test'
import assert from 'node:assert/strict'
import { routeAccountId } from '../lib/account-route.js'
test('named routes never silently fall back to default credentials', () => {
 const id = '11111111-1111-4111-8111-111111111111'
 assert.equal(routeAccountId('openai-codex-'+id),id)
 assert.equal(routeAccountId('openai-codex'),'default')
 assert.equal(routeAccountId('other-provider'),'default')
 for (const suffix of ['default','../escape','bad','']) assert.throws(() => routeAccountId('openai-codex-'+suffix))
})
