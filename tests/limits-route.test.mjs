import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import * as contextIndicator from '../lib/context-indicator-client.js'

const source = readFileSync(new URL('../src/limits-client.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const exports = {}
vm.runInNewContext(compiled, { exports, require: name => name === './context-indicator-client.js' ? contextIndicator : createRequire(import.meta.url)(name) })
const render = selection => exports.CodexLimits({ t: () => '', useProjection: key => { assert.equal(key, 'modelSelection'); return selection } })
const route = provider => ({ provider, model: 'test' })

test('routes the polling child only to the effective Codex selection', () => {
  for (const selection of [undefined, { next: null, lastUsed: null }, { next: route('other'), lastUsed: route('openai-codex') }]) assert.equal(render(selection), null)
  for (const selection of [{ next: route('openai-codex'), lastUsed: route('other') }, { next: null, lastUsed: route('openai-codex') }]) assert.equal(render(selection).type.name, 'CodexLimitsPolling')
  assert.equal(render({ next: route('other'), lastUsed: route('openai-codex') }), null)
})

test('native meter hide is restricted to the composer containing Codex controls', () => {
  assert.ok(source.includes('[data-composer-dock]:has([data-codex-limits]) > .JObwrW_root,'))
  assert.ok(source.includes('[data-composer-dock]:has([data-codex-limits]) [data-composer-stat="usage"]{display:none}'))
  assert.ok(source.includes('<CodexContextIndicator useProjection={useProjection}'))
})
test('polling effect aborts on child cleanup', () => {
  assert.match(source, /return \(\) => \{ controller\.abort\(\); window\.clearInterval\(timer\); document\.removeEventListener\('visibilitychange', visible\) \}/)
})
