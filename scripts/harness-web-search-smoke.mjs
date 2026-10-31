// Opt-in full Harness tool test. Requires DSH_CLI and existing ChatGPT sign-in.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readdir, rm, cp, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
const exec = promisify(execFile)
const cli = process.env.DSH_CLI
assert.ok(cli, 'Set DSH_CLI to the installed Harness bin.js')
const root = await mkdtemp(join(tmpdir(), 'dsh-codex-search-'))
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))).flat()
}
try {
  const home = join(root, 'home'), workspace = join(root, 'workspace'), patch = join(root, 'patch.json')
  await mkdir(workspace)
  // Mount the candidate as a real bundle, with peers from the installed host.
  const modules = join(home, 'profiles', 'headless', 'node_modules')
  await mkdir(modules, { recursive: true })
  const candidate = process.env.DSH_SMOKE_PROVIDER || resolve('lib/index.js')
  const candidatePackage = dirname(dirname(candidate))
  const installedModules = resolve(dirname(cli), '../../..')
  const bundle = join(modules, 'dsh-openai-oauth')
  await mkdir(bundle)
  for (const entry of ['lib', 'package.json', 'cordis.patch.yml']) await cp(join(candidatePackage, entry), join(bundle, entry), { recursive: true })
  await symlink(join(installedModules, '@deepseek-ai'), join(modules, '@deepseek-ai'))
  await symlink(resolve('node_modules/@openai'), join(modules, '@openai'))
  await writeFile(join(home, 'profiles', 'headless', 'package.json'), JSON.stringify({ name: 'search-smoke', private: true,
    dependencies: { 'dsh-openai-oauth': '0.4.8' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless', 'dsh-openai-oauth'] } } }))
  await writeFile(patch, JSON.stringify([
    { id: 'agent-default-model', config: { provider: 'openai-codex', model: 'gpt-6.1-sol', reasoningEffort: 'low' } },
    { id: 'web', config: { searchProvider: 'openai-codex', fetchProvider: 'http' } },
    { id: 'tool-web', config: { searchTimeoutMs: 120000 } },
    { id: 'session-title-llm', disabled: true },
  ]))
  await exec(process.execPath, [cli, '--profile', 'headless', '--patch', patch,
    'Use web_search exactly once with one query: site:developers.openai.com Codex app-server. Then give a brief answer citing one returned source URL. No other tools.'],
    { cwd: workspace, env: { ...process.env, DSH_HOME: home }, timeout: 180000, maxBuffer: 2_000_000 })
  const logs = (await files(join(home, 'sessions'))).filter(p => p.endsWith('.jsonl.zstd'))
  const events = []
  for (const p of logs) {
    const { stdout } = await exec('zstd', ['-dc', p], { maxBuffer: 5_000_000 })
    events.push(...stdout.trim().split('\n').map(JSON.parse))
  }
  const calls = events.filter(e => e.type === 'tool/call' && e.data.name === 'web_search')
  assert.equal(calls.length, 1)
  const result = events.find(e => e.type === 'tool/result' && e.data.message.toolCallId === calls[0].data.callId)
  assert.ok(result)
  assert.notEqual(result.data.message.isError, true, JSON.stringify(result.data.message.content))
  assert.ok(result.data.meta.sources.length > 0)
  const audit = events.find(e => e.type === 'plugin:dsh-openai-oauth/search-llm-request')
  assert.equal(audit?.ignorable, true)
  assert.equal(audit?.data.nativeSearch, true)
  const final = events.filter(e => e.type === 'assistant/message').at(-1)
  const text = final.data.message.content.filter(b => b.type === 'text').map(b => b.text).join('')
  assert.ok(result.data.meta.sources.some(s => text.includes(s.url)), text)
  console.log(JSON.stringify({ status: 'PASS', nativeTool: calls[0].data.name,
    sourceCards: result.data.meta.sources.length, nativeSearch: audit.data.nativeSearch, citedSource: true }))
} finally { await rm(root, { recursive: true, force: true }) }
