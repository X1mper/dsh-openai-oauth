import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { AppServer } from '../lib/app-server.js'
import { handleOAuthRequest } from '../lib/oauth-http.js'
import { handleAccountsRequest } from '../lib/accounts-http.js'

const device = { type: 'chatgptDeviceCode', loginId: 'test-login', userCode: 'TEST-CODE', verificationUrl: 'https://example.com/device' }
function req(path, data, method = 'POST') {
  return Object.assign(Readable.from(data ? [JSON.stringify(data)] : []), {
    method, url: '/api/codex-oauth' + path, headers: { host: 'localhost', origin: 'http://localhost' }, socket: { remoteAddress: '127.0.0.1' },
  })
}
function res() { return { status: 0, writeHead(s) { this.status = s }, end(s) { this.body = JSON.parse(s) } } }
test('device and cancel RPC contracts delegate without logout', async () => {
  const calls = []
  const server = Object.create(AppServer.prototype)
  server.request = async (...args) => { calls.push(args); return {} }
  await server.startDeviceCodeLogin()
  await server.cancelLogin('test-login')
  assert.deepEqual(calls, [['account/login/start', { type: 'chatgptDeviceCode' }], ['account/login/cancel', { loginId: 'test-login' }]])
})
test('device HTTP returns allowlisted fields and cancellation status', async () => {
  const server = { async startDeviceCodeLogin() { return { ...device, secret: 'not returned' } }, async cancelLogin(id) { assert.equal(id, device.loginId); return { status: 'canceled', secret: 'hidden' } } }
  const start = res(); await handleOAuthRequest(server, req('/login/device'), start)
  assert.equal(start.status, 200); assert.deepEqual(start.body, device)
  const cancel = res(); await handleOAuthRequest(server, req('/login/cancel', { loginId: device.loginId }), cancel)
  assert.deepEqual(cancel.body, { status: 'canceled' })
})
test('device endpoints use native gate before RPC or body and sanitize failures', async () => {
  let calls = 0
  const server = { async startDeviceCodeLogin() { calls++; throw new Error('secret TEST-CODE') } }
  for (const path of ['/login/device', '/login/cancel']) {
    const blocked = res(); await handleOAuthRequest(server, req(path), blocked, () => 401)
    assert.equal(blocked.status, 401)
  }
  assert.equal(calls, 0)
  const failed = res(); await handleOAuthRequest(server, req('/login/device'), failed)
  assert.equal(failed.status, 500); assert.deepEqual(failed.body, { error: 'Codex account operation failed.' })
})
test('device rejects unsafe URLs and malformed responses', async () => {
  for (const value of [{ ...device, verificationUrl: 'http://example.com' }, { ...device, verificationUrl: 'https://user:pass@example.com' }, { ...device, userCode: null }, { ...device, type: 'chatgpt' }]) {
    const out = res(); await handleOAuthRequest({ async startDeviceCodeLogin() { return value } }, req('/login/device'), out)
    assert.equal(out.status, 500)
  }
})
test('cancel requires bounded login ID and unsupported device fails safely', async () => {
  const server = { async cancelLogin() { throw new Error('should not call') } }
  for (const loginId of [null, '', 'x'.repeat(513)]) {
    const out = res(); await handleOAuthRequest(server, req('/login/cancel', { loginId }), out)
    assert.equal(out.status, 400)
  }
  const out = res(); await handleOAuthRequest({}, req('/login/device'), out); assert.equal(out.status, 503)
})
test('named device and cancel dispatch only to selected isolated account', async () => {
  const calls = []
  const runtime = { accounts: { get(id) { assert.equal(id, 'work') } }, accountServer(id) { calls.push(id); return {
    async startDeviceCodeLogin() { return device },
    async cancelLogin(loginId) { calls.push(loginId); return { status: 'notFound' } },
    async account(refresh) { assert.equal(refresh, false); return null },
  } } }
  for (const [suffix, data, method] of [['/login/device'], ['/login/cancel', { loginId: device.loginId }], ['', undefined, 'GET']]) {
    const out = res(); await handleAccountsRequest(runtime, req('/accounts/work' + suffix, data, method), out)
    assert.equal(out.status, 200)
  }
  assert.deepEqual(calls, ['work', 'work', 'test-login', 'work'])
})
