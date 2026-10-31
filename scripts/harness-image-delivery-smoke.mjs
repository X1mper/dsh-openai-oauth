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
const root = await mkdtemp(join(tmpdir(), 'dsh-codex-delivery-'))
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
  await writeFile(join(home, 'profiles', 'headless', 'package.json'), JSON.stringify({ name: 'image-generation-smoke', private: true,
    dependencies: { 'dsh-openai-oauth': '0.4.9' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless', 'dsh-openai-oauth'] } } }))
  await writeFile(patch, JSON.stringify([
    { insert: [{ id: 'image-smoke-present', name: '@deepseek-ai/dsh-tool-present', config: { maxFiles: 4 } }] },
    { id: 'agent-default-model', config: { provider: 'openai-codex', model: 'gpt-6.1-sol', reasoningEffort: 'low' } },
    { id: 'web', config: { searchProvider: 'openai-codex', fetchProvider: 'openai-codex' } },
    { id: 'tool-web', config: { searchTimeoutMs: 120000, fetchTimeoutMs: 120000 } },
    { id: 'session-title-llm', disabled: true },
  ]))
  const execution = await exec(process.execPath, [cli, '--profile', 'headless', '--patch', patch,
    'Нарисуй квадратный аватар: простой синий круг на белом фоне без текста.'],
    { cwd: workspace, env: { ...process.env, DSH_HOME: home }, timeout: 600000, maxBuffer: 2_000_000 })
  const logs = (await files(join(home, 'sessions'))).filter(p => p.endsWith('.jsonl.zstd'))
  const events = []
  for (const p of logs) {
    const { stdout } = await exec('zstd', ['-dc', p], { maxBuffer: 5_000_000 })
    events.push(...stdout.trim().split('\n').map(JSON.parse))
  }
  const calls = events.filter(e => e.type === 'tool/call')
  assert.deepEqual(calls.map(c => c.data.name), ['image_generate', 'present'], execution.stdout + '\n' + execution.stderr)
  const result = events.find(e => e.type === 'tool/result' && e.data.message.toolCallId === calls[0].data.callId)
  assert.ok(result && !result.data.message.isError, JSON.stringify(result))
  assert.ok(result.data.message.content.some(b => b.type === 'image'))
  const delivery = JSON.parse(calls[1].data.arguments).files[0].path
  assert.ok(result.data.message.content.some(b => b.type === 'text' && b.text.includes(delivery)))
  const presentResult = events.find(e => e.type === 'tool/result' && e.data.message.toolCallId === calls[1].data.callId)
  assert.ok(presentResult && !presentResult.data.message.isError, JSON.stringify(presentResult))
  const final = events.filter(e => e.type === 'assistant/message').at(-1).data.message.content.filter(b => b.type === 'text').map(b => b.text).join('')
  assert.ok(final.includes(delivery) && /!\[.*?\]\(/s.test(final), final)
  console.log(JSON.stringify({ status: 'PASS', tools: calls.map(c => c.data.name), presentedPath: delivery, finalImage: true }))

} finally { await rm(root, { recursive: true, force: true }) }
