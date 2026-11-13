import { handleOAuthRequest, trusted, json } from './oauth-http.js';
const ROOT = '/api/codex-oauth/accounts';
async function body(req) {
    let data = '';
    for await (const chunk of req) {
        data += String(chunk);
        if (Buffer.byteLength(data) > 4096)
            throw new Error('Request too large');
    }
    const value = JSON.parse(data);
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid body');
    return value;
}
export async function handleAccountsRequest(runtime, req, res, gate) {
    const rejection = gate === undefined ? (trusted(req) ? undefined : 403) : gate(req);
    if (rejection !== undefined)
        return json(res, rejection, { error: 'Account controls require an authenticated, trusted Harness UI.' });
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    try {
        if (path === ROOT) {
            if (req.method === 'GET')
                return json(res, 200, { accounts: runtime.accounts.list() });
            if (req.method === 'POST') {
                const account = await runtime.accounts.create((await body(req)).name);
                runtime.changed();
                return json(res, 201, { account });
            }
        }
        const match = /^\/api\/codex-oauth\/accounts\/([^/]+)(?:\/(login(?:\/device|\/cancel)?|logout|limits))?$/.exec(path);
        if (!match)
            return json(res, 404, { error: 'Not found' });
        const id = match[1];
        runtime.accounts.get(id);
        if (!match[2] && req.method === 'PATCH') {
            const account = await runtime.accounts.rename(id, (await body(req)).name);
            runtime.changed();
            return json(res, 200, { account });
        }
        if (!match[2] && req.method === 'DELETE') {
            await runtime.accounts.delete(id);
            runtime.changed();
            return json(res, 200, { ok: true, credentialsPreserved: true });
        }
        const url = req.url;
        req.url = '/api/codex-oauth' + (match[2] ? '/' + match[2] : '');
        try {
            await handleOAuthRequest(runtime.accountServer(id), req, res, gate);
        }
        finally {
            req.url = url;
        }
    }
    catch {
        return json(res, 400, { error: 'Invalid account request or account unavailable.' });
    }
}
