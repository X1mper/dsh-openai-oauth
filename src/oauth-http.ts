import type { IncomingMessage, ServerResponse } from 'node:http'
import { isIP } from 'node:net'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { AppServer } from './app-server.js'
import { limitWindows } from './limits.js'

const PATH = '/api/codex-oauth'

function loopback(address: string | undefined): boolean {
  if (address === undefined) return false
  if (address === '::1') return true
  const ipv4 = address.startsWith('::ffff:') ? address.slice(7) : address
  return isIP(ipv4) === 4 && ipv4.startsWith('127.')
}

/** Native Connection admission includes configured Host/Origin and browser/API authentication. */
export type RequestGate = (req: IncomingMessage) => 401 | 403 | undefined

export function trusted(req: IncomingMessage, gate?: RequestGate): boolean {
  if (gate !== undefined) return gate(req) === undefined
  if (!loopback(req.socket.remoteAddress)) return false
  const host = req.headers.host
  if (host === undefined) return false
  let authority: URL
  try {
    authority = new URL(`http://${host}`)
  } catch {
    return false
  }
  const hostname = authority.hostname.replace(/^\[|\]$/g, '')
  if (hostname !== 'localhost' && hostname !== '::1' && !(isIP(hostname) === 4 && hostname.startsWith('127.'))) {
    return false
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).origin === authority.origin
  } catch {
    return false
  }
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

export async function handleOAuthRequest(
  server: Pick<AppServer, 'account' | 'models' | 'startChatGptLogin' | 'logout'> & Partial<Pick<AppServer, 'rateLimits'>>,
  req: IncomingMessage,
  res: ServerResponse,
  gate?: RequestGate,
): Promise<void> {
  const rejection = gate === undefined ? (trusted(req) ? undefined : 403) : gate(req)
  if (rejection !== undefined) return json(res, rejection, { error: 'OAuth controls require an authenticated, trusted Harness UI.' })
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  try {
    if (req.method === 'GET' && path === `${PATH}/limits`) {
      if (server.rateLimits === undefined) return json(res, 503, { error: 'Codex limits are unavailable.' })
      const account = await server.account(false)
      if (account?.type !== 'chatgpt') return json(res, 200, { authenticated: false, windows: [] })
      const result = await server.rateLimits()
      return json(res, 200, { authenticated: true, windows: limitWindows(result), updatedAt: Date.now() })
    }
    if (req.method === 'GET' && path === PATH) {
      const account = await server.account(false)
      if (account?.type !== 'chatgpt') return json(res, 200, { authenticated: false, models: [] })
      const models = (await server.models()).filter(model => model.hidden !== true).map(model => ({
        id: String(model.model ?? model.id),
        name: String(model.displayName ?? model.model ?? model.id),
      }))
      return json(res, 200, {
        authenticated: true,
        email: typeof account.email === 'string' ? account.email : null,
        planType: typeof account.planType === 'string' ? account.planType : null,
        models,
      })
    }
    if (req.method === 'POST' && path === `${PATH}/login`) {
      const result = await server.startChatGptLogin()
      return json(res, 200, { authUrl: result.authUrl, loginId: result.loginId })
    }
    if (req.method === 'POST' && path === `${PATH}/logout`) {
      await server.logout()
      return json(res, 200, { ok: true })
    }
    return json(res, 404, { error: 'Not found' })
  } catch {
    // RPC errors can contain provider internals; never return them to the browser.
    return json(res, 500, { error: 'Codex account operation failed.' })
  }
}

export function oauthRoute(server: AppServer, gate: RequestGate): WebRoute {
  return {
    kind: 'prefix',
    path: PATH,
    handler: (req, res) => handleOAuthRequest(server, req, res, gate),
  }
}
