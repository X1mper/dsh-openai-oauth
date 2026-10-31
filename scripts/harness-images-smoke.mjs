// Opt-in MCP image → durable attachment → Codex vision test. Pass PNG_PATH EXPECTED_TEXT.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readdir, rm, cp, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
const exec = promisify(execFile)
const cli = process.env.DSH_CLI
assert.ok(cli, 'Set DSH_CLI to the installed Harness bin.js')
const [imagePath, expected] = process.argv.slice(2)
assert.ok(imagePath && expected, 'Provide PNG_PATH EXPECTED_TEXT')
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
  const fixture = join(root, 'image-server.mjs')
  await writeFile(fixture, `
    import {createInterface} from 'node:readline';
    import {readFile} from 'node:fs/promises';
    const data=(await readFile(${JSON.stringify(imagePath)})).toString('base64');
    const tool={name:'screenshot',description:'Return the screenshot image to inspect.',inputSchema:{type:'object',properties:{},additionalProperties:false}};
    createInterface({input:process.stdin}).on('line', line=>{
      const request=JSON.parse(line);
      if(request.id===undefined)return;
      let result;
      if(request.method==='initialize')result={protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'image-fixture',version:'1'}};
      else if(request.method==='tools/list')result={tools:[tool]};
      else if(request.method==='tools/call' && request.params.name==='screenshot')result={content:[{type:'text',text:'Screenshot captured.'},{type:'image',mimeType:'image/png',data}]};
      else if(request.method==='ping')result={};
      const response=result===undefined?{jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Method not found'}}:{jsonrpc:'2.0',id:request.id,result};
      process.stdout.write(JSON.stringify(response)+'\\n');
    });
  `)
  await writeFile(patch, JSON.stringify([
    { insert: [{ id: 'image-fixture-mcp', name: '@deepseek-ai/dsh-mcp-client', config: {
      serverName: 'image_fixture', transport: 'stdio', command: process.execPath, args: [fixture], failOnStartupError: true,
    } }] },
    { id: 'agent-default-model', config: { provider: 'openai-codex', model: 'gpt-6.1-sol', reasoningEffort: 'low' } },
    { id: 'web', config: { searchProvider: 'openai-codex', fetchProvider: 'http' } },
    { id: 'tool-web', config: { searchTimeoutMs: 120000 } },
    { id: 'session-title-llm', disabled: true },
  ]))
  const execution = await exec(process.execPath, [cli, '--profile', 'headless', '--patch', patch,
    'Use the screenshot tool exactly once, inspect the returned image and quote its visible error in English. Do not use other tools.'],
    { cwd: workspace, env: { ...process.env, DSH_HOME: home }, timeout: 180000, maxBuffer: 2_000_000 })
  const logs = (await files(join(home, 'sessions'))).filter(p => p.endsWith('.jsonl.zstd'))
  const events = []
  for (const p of logs) {
    const { stdout } = await exec('zstd', ['-dc', p], { maxBuffer: 5_000_000 })
    events.push(...stdout.trim().split('\n').map(JSON.parse))
  }
  const calls = events.filter(e => e.type === 'tool/call' && e.data.name === 'mcp__image_fixture__screenshot')
  assert.equal(calls.length, 1, execution.stdout + '\n' + execution.stderr)
  const result = events.find(e => e.type === 'tool/result' && e.data.message.toolCallId === calls[0].data.callId)
  assert.ok(result)
  assert.notEqual(result.data.message.isError, true, JSON.stringify(result.data.message.content))
  assert.ok(result.data.message.content.some(b => b.type === 'image' && b.attachment))
  const final = events.filter(e => e.type === 'assistant/message').at(-1)
  const text = final.data.message.content.filter(b => b.type === 'text').map(b => b.text).join('')
  assert.ok(text.toLowerCase().includes(expected.toLowerCase()), text)
  console.log(JSON.stringify({ status: 'PASS', nativeTool: calls[0].data.name, durableImage: true, recognized: expected }))
} finally { await rm(root, { recursive: true, force: true }) }
