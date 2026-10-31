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
const root = await mkdtemp(join(tmpdir(), 'dsh-codex-imagegen-'))
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
    { id: 'agent-default-model', config: { provider: 'openai-codex', model: 'gpt-6.1-sol', reasoningEffort: 'low' } },
    { id: 'web', config: { searchProvider: 'openai-codex', fetchProvider: 'openai-codex' } },
    { id: 'tool-web', config: { searchTimeoutMs: 120000, fetchTimeoutMs: 120000 } },
    { id: 'session-title-llm', disabled: true },
  ]))
  const execution = await exec(process.execPath, [cli, '--profile', 'headless', '--patch', patch,
    'Call image_generate exactly once with prompt: a single flat red circle on a plain white background, no text. Then call image_edit exactly once using the returned attachment ID, with prompt: change only the red circle to blue, preserve its shape, placement and white background. Inspect the images. Do not use other tools. Report both attachment IDs.'],
    { cwd: workspace, env: { ...process.env, DSH_HOME: home }, timeout: 600000, maxBuffer: 2_000_000 })
  const logs = (await files(join(home, 'sessions'))).filter(p => p.endsWith('.jsonl.zstd'))
  const events = []
  for (const p of logs) {
    const { stdout } = await exec('zstd', ['-dc', p], { maxBuffer: 5_000_000 })
    events.push(...stdout.trim().split('\n').map(JSON.parse))
  }
  const calls = events.filter(e => e.type === 'tool/call' && ['image_generate', 'image_edit'].includes(e.data.name))
  assert.deepEqual(calls.map(c => c.data.name), ['image_generate', 'image_edit'], execution.stdout + '\n' + execution.stderr + '\n' + JSON.stringify(events.filter(e => e.type === 'tool/call').map(e => e.data.name)))
  const images = []
  for (const call of calls) {
    const result = events.find(e => e.type === 'tool/result' && e.data.message.toolCallId === call.data.callId)
    assert.ok(result)
    assert.notEqual(result.data.message.isError, true, JSON.stringify(result.data.message.content))
    const block = result.data.message.content.find(b => b.type === 'image')
    assert.ok(block?.attachment)
    images.push(block.attachment)
  }
  assert.notEqual(images[0].attachmentId, images[1].attachmentId)
  const audit = events.filter(e => e.type === 'plugin:dsh-openai-oauth/image-llm-request')
  assert.deepEqual(audit.map(e => e.data.mode), ['generate', 'edit'])
  assert.ok(audit.every(e => e.data.nativeImage && e.data.completed))
  console.log(JSON.stringify({ status: 'PASS', tools: calls.map(c => c.data.name), durableImages: images }))

} finally { await rm(root, { recursive: true, force: true }) }
