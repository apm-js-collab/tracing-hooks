'use strict'
import test from 'node:test'
import assert from 'node:assert'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import Snap from '@matteo.collina/snap'
import { modules, instrumentations } from './module-types/instrumentations.mjs'

test.beforeEach(async (t) => {
  const syncLoaderRewriter = await import('../hook-sync.mjs')
  syncLoaderRewriter.initialize({
    instrumentations: [
        {
          channelName: 'unitTestEsm',
          module: { name: 'esm-pkg', versionRange: '>=1', filePath: 'foo.js' },
          functionQuery: {
            className: 'Foo',
            methodName: 'doStuff',
            kind: 'Async'
          }
        },
        {
          channelName: 'unitTestCjs',
          module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
          functionQuery: {
            className: 'Foo',
            methodName: 'doStuff',
            kind: 'Async'
          }
        }
    ] 
  })

  const snap = Snap(`${import.meta.url}/${t.name}`)

  t.ctx = {
    syncLoaderRewriter,
    snap
  }
})


test('should rewrite code if it matches a subscriber and esm module', async (t) => {
  const { syncLoaderRewriter, snap } = t.ctx
  const esmPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  function nextLoad() {
    const data = readFileSync(esmPath, 'utf8')
    return {
      format: 'module',
      source: data
    }
  }
  const url = syncLoaderRewriter.resolve('esm-pkg', {}, resolveFn)
  const result = syncLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'module')
  assert.equal(result.shortCircuit, true)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

test('should not rewrite code if it does not match a subscriber and a esm module', async (t) => {
  const { syncLoaderRewriter, snap } = t.ctx 
  const esmPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/esm-pkg-2/index.js')
  function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  function nextLoad() {
    const data = readFileSync(esmPath, 'utf8')
    return {
      format: 'module',
      source: data
    }
  }
  const url = syncLoaderRewriter.resolve('esm-pkg-2', {}, resolveFn)
  const result = syncLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'module')
  assert.ok(!result.shortCircuit)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

test('should rewrite code if it matches a subscriber and a cjs module', async (t) => {
  const { syncLoaderRewriter, snap } = t.ctx
  const cjsPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  function resolveFn() {
    return { url: `file://${cjsPath}` }
  }
  function nextLoad(url, context) {
    const data = readFileSync(cjsPath, 'utf8')
    return {
      format: 'commonjs',
      source: data
    }
  }

  const url = syncLoaderRewriter.resolve('pkg-1', {}, resolveFn)
  const result = syncLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'commonjs')
  assert.equal(result.shortCircuit, true)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

test('should rewrite code if it matches a subscriber and a cjs module(responseUrl)', async (t) => {
  const { syncLoaderRewriter, snap } = t.ctx
  const cjsPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  function resolveFn() {
    return { url: `file://${cjsPath}` }
  }
  function nextLoad(url) {
    const data = readFileSync(cjsPath, 'utf8')
    return {
      repsonseURL: url,
      format: 'commonjs',
      source: data
    }
  }
  const url = syncLoaderRewriter.resolve('pkg-1', {}, resolveFn)
  const result = syncLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'commonjs')
  assert.equal(result.shortCircuit, true)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

test('should not rewrite code if it does not match a subscriber and a cjs module', async (t) => {
  const { syncLoaderRewriter, snap } = t.ctx
  const cjsPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/pkg-2/index.js')
  function resolveFn() {
    return { url: `file://${cjsPath}` }
  }

  function nextLoad() {
    const data = readFileSync(cjsPath, 'utf8')
    return {
      format: 'commonjs',
      source: data
    }
  }

  const url = syncLoaderRewriter.resolve('pkg-2', {}, resolveFn)
  const result = syncLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'commonjs')
  assert.ok(!result.shortCircuit)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

test('should not rewrite code if a function query does not exist in file', async (t) => {
  const { syncLoaderRewriter, snap } = t.ctx
  syncLoaderRewriter.initialize({
    instrumentations: [
        {
          channelName: 'unitTestEsm',
          module: { name: 'esm-pkg', versionRange: '>=1', filePath: 'foo.js' },
          functionQuery: {
            className: 'Blah',
          }
        }
    ] 
  })
  const esmPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  function nextLoad() {
    const data = readFileSync(esmPath, 'utf8')
    return {
      format: 'module',
      source: data
    }
  }
  const url = syncLoaderRewriter.resolve('esm-pkg', {}, resolveFn)
  const result = syncLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'module')
  assert.ok(!result.shortCircuit)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

test('should default initialization to not crash if not defined', async (t) => {
  const { syncLoaderRewriter, snap } = t.ctx
  syncLoaderRewriter.initialize()
  const esmPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  function nextLoad() {
    const data = readFileSync(esmPath, 'utf8')
    return {
      format: 'module',
      source: data
    }
  }
  const url = syncLoaderRewriter.resolve('esm-pkg', {}, resolveFn)
  const result = syncLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'module')
  assert.ok(!result.shortCircuit)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

test('should rewrite code when the loader provides source as a Uint8Array (not a Buffer)', async (t) => {
  const { syncLoaderRewriter } = t.ctx
  const esmPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  const url = `file://${esmPath}`
  function resolveFn() {
    return { url }
  }
  // Node's synchronous module hooks (`Module.registerHooks`, Node >= 24.13 / 25.1 / 26) deliver the
  // module source as a plain `Uint8Array`, unlike the async loader which provides a `Buffer`. A plain
  // `Uint8Array.prototype.toString('utf8')` ignores the encoding and returns comma-joined byte values
  // rather than the decoded text, so this is the exact shape that must be handled.
  function nextLoadBytes() {
    const buf = readFileSync(esmPath)
    const source = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    assert.ok(!Buffer.isBuffer(source), 'precondition: source is a plain Uint8Array, not a Buffer')
    return { format: 'module', source }
  }
  function nextLoadString() {
    return { format: 'module', source: readFileSync(esmPath, 'utf8') }
  }

  syncLoaderRewriter.resolve('esm-pkg', {}, resolveFn)
  const fromString = syncLoaderRewriter.load(url, {}, nextLoadString)
  syncLoaderRewriter.resolve('esm-pkg', {}, resolveFn)
  const fromBytes = syncLoaderRewriter.load(url, {}, nextLoadBytes)

  assert.equal(fromBytes.format, 'module')
  assert.equal(fromBytes.shortCircuit, true, 'matching module must be transformed even when source is a Uint8Array')
  assert.equal(typeof fromBytes.source, 'string')
  // Byte-source and string-source inputs must produce identical transformed output.
  assert.equal(fromBytes.source, fromString.source)
})

// The sync hooks are the only path that transforms CommonJS in the loader — there is no
// `_compile` patch alongside `Module.registerHooks` — so the format=commonjs →
// module_type=cjs mapping has to hold here. A CJS target injected with an ESM `import`
// prelude would not compile.
test('format=commonjs emits CJS-shaped diagnostics_channel require', async (t) => {
  const { syncLoaderRewriter } = t.ctx
  const cjsPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  function resolveFn() {
    return { url: `file://${cjsPath}` }
  }
  function nextLoad() {
    return {
      format: 'commonjs',
      source: readFileSync(cjsPath, 'utf8')
    }
  }
  const url = syncLoaderRewriter.resolve('pkg-1', {}, resolveFn)
  const result = syncLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.shortCircuit, true)
  assert.match(result.source, /=\s*require\(["']diagnostics_channel["']\)/,
    'CJS target should be injected with `require("diagnostics_channel")`')
  assert.doesNotMatch(result.source, /^import .* from ["']diagnostics_channel["']/m,
    'CJS target should not be injected with `import ... from "diagnostics_channel"`')
})

// `format` is not always supplied. Deno's sync hooks report none at all, for
// ESM and CommonJS alike, so the injection style has to come from the module
// itself: the file extension, then the nearest package.json `"type"`, then the
// source. Both wrong guesses throw on load, `ReferenceError: require is not
// defined` in an ES module and `ReferenceError: module is not defined` in a
// CommonJS one (issue #53).
test('unlabeled format picks the injection style from the module', async (t) => {
  const { syncLoaderRewriter } = t.ctx

  // The case table lives with the fixture, and `test/module-types.test.mjs`
  // runs the loadable half of it end to end under both Node and Deno.
  syncLoaderRewriter.initialize({ instrumentations })

  const esmImport = /^import .* from ["']diagnostics_channel["']/m
  const cjsRequire = /=\s*require\(["']diagnostics_channel["']\)/

  for (const { name, filePath, type, why } of modules) {
    const file = path.join(import.meta.dirname, 'module-types/node_modules', name, filePath)
    const url = syncLoaderRewriter.resolve(name, {}, () => ({ url: pathToFileURL(file).href }))
    // No `format` in the load result, which is what Deno's hooks give.
    const result = syncLoaderRewriter.load(url.url, {},
      () => ({ source: readFileSync(file, 'utf8') }))

    assert.equal(result.shortCircuit, true, `${name} should be transformed`)
    assert.match(result.source, type === 'esm' ? esmImport : cjsRequire,
      `${name} is ${type} by ${why}`)
    assert.doesNotMatch(result.source, type === 'esm' ? cjsRequire : esmImport,
      `${name} is ${type} by ${why}`)
  }
})

// JSON is data. When an instrumentation's `filePath` matcher reaches a
// `.json` file, the hooks have to hand it back untouched. There is nothing
// in it to instrument, and parsing it as JavaScript reports a transform
// error that tells the consumer nothing. Node labels these `format: 'json'`
// and Deno labels nothing at all, so both shapes must skip (issue #53).
test('json modules are handed back untouched', async (t) => {
  const { syncLoaderRewriter } = t.ctx
  const jsonPath = path.join(import.meta.dirname,
    './example-deps/lib/node_modules/pkg-1/data.json')
  const source = readFileSync(jsonPath, 'utf8')

  const diagnostics = []
  syncLoaderRewriter.setDiagnosticsHook(d => diagnostics.push(d))
  t.after(() => syncLoaderRewriter.setDiagnosticsHook(undefined))

  // A matcher that reaches the JSON file. Without the skip, the transformer
  // it produces parses the file and reports a syntax error.
  syncLoaderRewriter.initialize({
    instrumentations: [
      {
        channelName: 'unitTestJson',
        module: { name: 'pkg-1', versionRange: '>=1', filePath: 'data.json' },
        functionQuery: { className: 'Foo', methodName: 'doStuff', kind: 'Sync' }
      }
    ]
  })

  // `format: 'json'` is what Node reports, `undefined` what Deno reports.
  for (const format of ['json', undefined]) {
    const url = syncLoaderRewriter.resolve('pkg-1', {},
      () => ({ url: pathToFileURL(jsonPath).href }))
    const result = syncLoaderRewriter.load(url.url, {}, () => ({ format, source }))

    assert.equal(result.source, source, `format=${format}: source must be unchanged`)
    assert.ok(!result.shortCircuit, `format=${format}: must not short circuit`)
  }

  assert.deepEqual(diagnostics, [], 'json must report no transform event')
})

test('should rewrite code and call diagnostics hook', async (t) => {
  const { syncLoaderRewriter, snap } = t.ctx
  syncLoaderRewriter.setDiagnosticsHook(({url, moduleName, error}) => {
    assert.equal(url, `file://${esmPath}`)
    assert.equal(moduleName, 'esm-pkg')
    assert.equal(error, undefined)
  })
  const esmPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  function nextLoad() {
    const data = readFileSync(esmPath, 'utf8')
    return {
      format: 'module',
      source: data
    }
  }
  const url = syncLoaderRewriter.resolve('esm-pkg', {}, resolveFn)
  syncLoaderRewriter.load(url.url, {}, nextLoad)
})