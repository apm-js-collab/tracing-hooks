'use strict'
import test from 'node:test'
import assert from 'node:assert'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { create } from '@apm-js-collab/code-transformer'

const fixture = (name) =>
  path.join(import.meta.dirname, `./example-deps/lib/node_modules/${name}/foo.js`)

async function writeTemp(source, ext) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tracing-hooks-compiled-'))
  const file = path.join(dir, `mod.${ext}`)
  await writeFile(file, source)
  return file
}

/**
 * Writes `source` to a temp `.mjs` and imports it.
 * Will fail if Node cannot accept the rewritten ESM.
 * @param {string} source 
 * @returns the module namespace
 */
async function importEsmSource(source) {
  return import(pathToFileURL(await writeTemp(source, 'mjs')).href)
}

/**
 * Writes `source` to a temp `.cjs` and requires it.
 * Will fail if Node cannot accept the rewritten CJS.
 * @param {string} source
 * @returns module.exports
 */
async function requireCjsSource(source) {
  const require = createRequire(import.meta.url)
  return require(await writeTemp(source, 'cjs'))
}

const esmInstrumentation = {
  channelName: 'unitTestEsm',
  module: { name: 'esm-pkg-compiled', versionRange: '>=1', filePath: 'foo.js' },
  functionQuery: { className: 'Foo', methodName: 'doStuff', kind: 'Async' }
}
const cjsInstrumentation = {
  channelName: 'unitTestCjs',
  module: { name: 'cjs-pkg-compiled', versionRange: '>=1', filePath: 'foo.js' },
  functionQuery: { className: 'Foo', methodName: 'doStuff', kind: 'Async' }
}

test.beforeEach(async (t) => {
  t.ctx = { hook: await import('../hook.mjs') }
})

test('compiled ESM (top-level await) is rewritten into importable ESM', async (t) => {
  const { hook } = t.ctx
  hook.initialize({ instrumentations: [esmInstrumentation] })
  const file = fixture('esm-pkg-compiled')
  async function resolveFn() {
    return { url: `file://${file}` }
  }
  async function nextLoad() {
    return { format: 'module', source: readFileSync(file, 'utf8') }
  }
  const url = await hook.resolve('esm-pkg-compiled', {}, resolveFn)
  const result = await hook.load(url.url, {}, nextLoad)

  assert.equal(result.format, 'module')
  assert.equal(result.shortCircuit, true)
  assert.match(result.source, /^import .* from ["']diagnostics_channel["']/m,
    'compiled ESM target should get an `import ... from "diagnostics_channel"` prelude')
  assert.doesNotMatch(result.source, /=\s*require\(["']diagnostics_channel["']\)/,
    'compiled ESM target must not get a `require("diagnostics_channel")` prelude')

  // Assert that Node accepts the rewritten module instead of throwing
  // ERR_AMBIGUOUS_MODULE_SYNTAX (require + top-level await).
  const mod = await importEsmSource(result.source)
  assert.equal(mod.default.name, 'Foo')
})

// Makes sure the fixture really triggers the bug. Running the old 'unknown' path 
// injects a CJS `require(...)` into ESM, which Node rejects — as ERR_AMBIGUOUS_MODULE_SYNTAX
// on Node >= 22 (require + top-level await) and as "require is not defined in
// ES module scope" on Node 20. Either way the module is broken.
test('compiled ESM fixture is broken when transformed with the wrong (old "unknown") module type', async () => {
  const file = fixture('esm-pkg-compiled')
  const instrumentator = create([esmInstrumentation])
  const transformer = instrumentator.getTransformer('esm-pkg-compiled', '1.0.0', 'foo.js')
  assert.ok(transformer, 'fixture should match the instrumentation rule')
  try {
    const out = transformer.transform(readFileSync(file, 'utf8'), 'unknown')
    await assert.rejects(
      () => importEsmSource(out.code),
      (err) =>
        err.code === 'ERR_AMBIGUOUS_MODULE_SYNTAX' || // Node >= 22
        /require is not defined/.test(err.message))   // Node 20
  } finally {
    transformer.free()
  }
})

test('compiled CJS is rewritten into requirable CommonJS', async (t) => {
  const { hook } = t.ctx
  hook.initialize({ instrumentations: [cjsInstrumentation] })
  const file = fixture('cjs-pkg-compiled')
  async function resolveFn() {
    return { url: `file://${file}` }
  }
  async function nextLoad() {
    return { format: 'commonjs', source: readFileSync(file, 'utf8') }
  }
  const url = await hook.resolve('cjs-pkg-compiled', {}, resolveFn)
  const result = await hook.load(url.url, {}, nextLoad)

  assert.equal(result.format, 'commonjs')
  assert.equal(result.shortCircuit, true)
  assert.match(result.source, /=\s*require\(["']diagnostics_channel["']\)/,
    'compiled CJS target should get a `require("diagnostics_channel")` prelude')
  assert.doesNotMatch(result.source, /^import .* from ["']diagnostics_channel["']/m,
    'compiled CJS target must not get an `import ... from "diagnostics_channel"` prelude')

  // Assert that Node still accepts the rewritten CommonJS module.
  const mod = await requireCjsSource(result.source)
  assert.equal(mod.default.name, 'Foo')
})
