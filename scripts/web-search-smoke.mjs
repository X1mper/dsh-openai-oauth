// Opt-in native web search using the existing isolated ChatGPT sign-in.
import assert from 'node:assert/strict'
import { AppServer } from '../lib/app-server.js'
import { CodexWebSearchProvider } from '../lib/web-search.js'
const server = new AppServer()
const audit = []
try {
  const provider = new CodexWebSearchProvider(server, () => process.env.DSH_SMOKE_MODEL || 'gpt-6.1-sol', event => audit.push(event))
  const result = await provider.search({ query: 'site:developers.openai.com Codex app-server thread compact start', maxResults: 3 })
  assert.ok(result.sources.length > 0)
  assert.ok(result.sources.length <= 3)
  assert.ok(audit[0].nativeSearch)
  console.log(JSON.stringify({ status: 'PASS', result, audit }, null, 2))
} finally { server.close() }
