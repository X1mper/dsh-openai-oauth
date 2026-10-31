// Opt-in vision test: node scripts/images-smoke.mjs IMAGE_PATH EXPECTED_TEXT
// Uses existing ChatGPT sign-in, no computer control or filesystem tools.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { AppServer } from '../lib/app-server.js'
import { CodexAppServerAdapter } from '../lib/index.js'
const [path, expected] = process.argv.slice(2)
assert.ok(path && expected, 'Provide a PNG path and expected visible text')
const data = await readFile(path)
assert.equal(data.subarray(1, 4).toString(), 'PNG')
const ref = { attachmentId: createHash('sha256').update(data).digest('hex'), mediaType: 'image/png',
  bytes: data.length, width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
const image = { type: 'image', attachment: ref }
const store = { async readImage(requested) { assert.deepEqual(requested, ref); return { ref, data } } }
const server = new AppServer()
const options = { provider: 'openai-codex', model: process.env.DSH_SMOKE_MODEL || 'gpt-6.1-sol',
  reasoningEffort: 'low', signal: AbortSignal.timeout(120000) }
const content = chunks => chunks.filter(c => c.type === 'block-end').map(c => c.block)
const answer = chunks => content(chunks).filter(b => b.type === 'text').map(b => b.text).join('')
try {
  const adapter = new CodexAppServerAdapter(server, undefined, store)
  const user = await Array.fromAsync(adapter.stream({ ...options, sessionId: `image-input-${Date.now()}`, tools: [],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Read the error message visible in this image. Quote the error in English.' }, image] }] }))
  assert.equal(user.at(-1).reason.kind, 'stop')
  assert.ok(answer(user).toLowerCase().includes(expected.toLowerCase()), answer(user))
  const toolOptions = { ...options, sessionId: `image-tool-${Date.now()}`,
    system: 'Call screenshot once, then read and quote the visible error. No other tools.',
    tools: [{ name: 'screenshot', description: 'Get the current screenshot.', parameters: { type: 'object', properties: {}, additionalProperties: false } }] }
  const messages = [{ role: 'user', content: [{ type: 'text', text: 'Take a screenshot and read the error message. Quote the error in English.' }] }]
  const call = await Array.fromAsync(adapter.stream({ ...toolOptions, messages }))
  assert.equal(call.at(-1).reason.kind, 'tool-calls')
  const tool = content(call).find(b => b.type === 'tool-call')
  assert.equal(tool.name, 'screenshot')
  messages.push({ role: 'assistant', content: content(call) }, { role: 'tool', toolCallId: tool.id, content: [image] })
  const result = await Array.fromAsync(adapter.stream({ ...toolOptions, messages }))
  assert.equal(result.at(-1).reason.kind, 'stop')
  assert.ok(answer(result).toLowerCase().includes(expected.toLowerCase()), answer(result))
  console.log(JSON.stringify({ status: 'PASS', userImage: true, toolScreenshot: true, recognized: expected }))
} finally { server.close() }
