'use strict'
import test from 'node:test'
import assert from 'node:assert'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import Snap from '@matteo.collina/snap'

test.beforeEach(async (t) => {
  const esmLoaderRewriter = await import('../hook.mjs')
  esmLoaderRewriter.initialize({
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
    esmLoaderRewriter,
    snap
  }
})


test('should rewrite code if it matches a subscriber and esm module', async (t) => {
  const { esmLoaderRewriter, snap } = t.ctx
  const esmPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  async function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  async function nextLoad() {
    const data = readFileSync(esmPath, 'utf8')
    return {
      format: 'module',
      source: data
    }
  }
  const url = await esmLoaderRewriter.resolve('esm-pkg', {}, resolveFn)
  const result = await esmLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'module')
  assert.equal(result.shortCircuit, true)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

test('should not rewrite code if it does not match a subscriber and a esm module', async (t) => {
  const { esmLoaderRewriter, snap } = t.ctx 
  const esmPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/esm-pkg-2/index.js')
  async function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  async function nextLoad() {
    const data = readFileSync(esmPath, 'utf8')
    return {
      format: 'module',
      source: data
    }
  }
  const url = await esmLoaderRewriter.resolve('esm-pkg-2', {}, resolveFn)
  const result = await esmLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'module')
  assert.ok(!result.shortCircuit)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

test('should rewrite code if it matches a subscriber and a cjs module', async (t) => {
  const { esmLoaderRewriter, snap } = t.ctx
  const cjsPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  async function resolveFn() {
    return { url: `file://${cjsPath}` }
  }
  async function nextLoad(url, context) {
    const data = readFileSync(cjsPath, 'utf8')
    return {
      format: 'commonjs',
      source: data
    }
  }

  const url = await esmLoaderRewriter.resolve('pkg-1', {}, resolveFn)
  const result = await esmLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'commonjs')
  assert.equal(result.shortCircuit, true)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

test('should rewrite code if it matches a subscriber and a cjs module(responseUrl)', async (t) => {
  const { esmLoaderRewriter, snap } = t.ctx
  const cjsPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  async function resolveFn() {
    return { url: `file://${cjsPath}` }
  }
  async function nextLoad(url) {
    const data = readFileSync(cjsPath, 'utf8')
    return {
      repsonseURL: url,
      format: 'commonjs',
      source: data
    }
  }
  const url = await esmLoaderRewriter.resolve('pkg-1', {}, resolveFn)
  const result = await esmLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'commonjs')
  assert.equal(result.shortCircuit, true)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

// With `transformCjs: false` the hook must hand CommonJS straight back so Node loads it
// through the ordinary CJS loader, where the `_compile` patch transforms it. Supplying
// `source` here would instead evaluate the module on the synchronous require(esm)
// bridge, which throws ERR_VM_MODULE_LINK_FAILURE on Node < 24.12 whenever the module's
// top-level require() chain reaches ESM (nodejs/node#59666).
test('should not rewrite a cjs module when transformCjs is false', async (t) => {
  const { esmLoaderRewriter } = t.ctx
  esmLoaderRewriter.initialize({
    transformCjs: false,
    instrumentations: [
      {
        channelName: 'unitTestCjs',
        module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
        functionQuery: { className: 'Foo', methodName: 'doStuff', kind: 'Async' }
      }
    ]
  })
  const cjsPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  async function resolveFn() {
    return { url: `file://${cjsPath}` }
  }
  // Node's `defaultLoad` reports `source: null` for commonjs; the hook must not fill it in.
  async function nextLoad() {
    return { format: 'commonjs', source: null }
  }

  const url = await esmLoaderRewriter.resolve('pkg-1', {}, resolveFn)
  const result = await esmLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'commonjs')
  assert.equal(result.source, null, 'source must stay null so the CJS loader handles the module')
  assert.ok(!result.shortCircuit)

  // `resolve` registered a transformer for this URL and the skip path is the only thing
  // that can free it. A second load must not reach the freed transformer.
  const again = await esmLoaderRewriter.load(url.url, {}, nextLoad)
  assert.ok(!again.shortCircuit)
})

test('should still rewrite an esm module when transformCjs is false', async (t) => {
  const { esmLoaderRewriter } = t.ctx
  esmLoaderRewriter.initialize({
    transformCjs: false,
    instrumentations: [
      {
        channelName: 'unitTestEsm',
        module: { name: 'esm-pkg', versionRange: '>=1', filePath: 'foo.js' },
        functionQuery: { className: 'Foo', methodName: 'doStuff', kind: 'Async' }
      }
    ]
  })
  const esmPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  async function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  async function nextLoad() {
    return { format: 'module', source: readFileSync(esmPath, 'utf8') }
  }

  const url = await esmLoaderRewriter.resolve('esm-pkg', {}, resolveFn)
  const result = await esmLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.shortCircuit, true)
  assert.match(result.source, /^import .* from ["']diagnostics_channel["']/m)
})

test('should not rewrite code if it does not match a subscriber and a cjs module', async (t) => {
  const { esmLoaderRewriter, snap } = t.ctx
  const cjsPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/pkg-2/index.js')
  async function resolveFn() {
    return { url: `file://${cjsPath}` }
  }

  async function nextLoad() {
    const data = readFileSync(cjsPath, 'utf8')
    return {
      format: 'commonjs',
      source: data
    }
  }

  const url = await esmLoaderRewriter.resolve('pkg-2', {}, resolveFn)
  const result = await esmLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'commonjs')
  assert.ok(!result.shortCircuit)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

test('should not rewrite code if a function query does not exist in file', async (t) => {
  const { esmLoaderRewriter, snap } = t.ctx
  esmLoaderRewriter.initialize({
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
  async function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  async function nextLoad() {
    const data = readFileSync(esmPath, 'utf8')
    return {
      format: 'module',
      source: data
    }
  }
  const url = await esmLoaderRewriter.resolve('esm-pkg', {}, resolveFn)
  const result = await esmLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'module')
  assert.ok(!result.shortCircuit)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

test('should default initialization to not crash if not defined', async (t) => {
  const { esmLoaderRewriter, snap } = t.ctx
  esmLoaderRewriter.initialize()
  const esmPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  async function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  async function nextLoad() {
    const data = readFileSync(esmPath, 'utf8')
    return {
      format: 'module',
      source: data
    }
  }
  const url = await esmLoaderRewriter.resolve('esm-pkg', {}, resolveFn)
  const result = await esmLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.format, 'module')
  assert.ok(!result.shortCircuit)
  const snapshot = await snap(result.source)
  assert.deepEqual(result.source, snapshot)
})

// The next three tests lock in the result.format → transformer module_type
// mapping. Without that mapping, ESM modules get a CJS-style `require(...)`
// prelude injected, which Node 22+ rejects with ERR_AMBIGUOUS_MODULE_SYNTAX.
test('format=module emits ESM-shaped diagnostics_channel import', async (t) => {
  const { esmLoaderRewriter } = t.ctx
  const esmPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  async function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  async function nextLoad() {
    return {
      format: 'module',
      source: readFileSync(esmPath, 'utf8')
    }
  }
  const url = await esmLoaderRewriter.resolve('esm-pkg', {}, resolveFn)
  const result = await esmLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.shortCircuit, true)
  assert.match(result.source, /^import .* from ["']diagnostics_channel["']/m,
    'ESM target should be injected with `import ... from "diagnostics_channel"`')
  assert.doesNotMatch(result.source, /=\s*require\(["']diagnostics_channel["']\)/,
    'ESM target should not be injected with `require("diagnostics_channel")`')
})

test('format=commonjs emits CJS-shaped diagnostics_channel require', async (t) => {
  const { esmLoaderRewriter } = t.ctx
  const cjsPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  async function resolveFn() {
    return { url: `file://${cjsPath}` }
  }
  async function nextLoad() {
    return {
      format: 'commonjs',
      source: readFileSync(cjsPath, 'utf8')
    }
  }
  const url = await esmLoaderRewriter.resolve('pkg-1', {}, resolveFn)
  const result = await esmLoaderRewriter.load(url.url, {}, nextLoad)
  assert.equal(result.shortCircuit, true)
  assert.match(result.source, /=\s*require\(["']diagnostics_channel["']\)/,
    'CJS target should be injected with `require("diagnostics_channel")`')
  assert.doesNotMatch(result.source, /^import .* from ["']diagnostics_channel["']/m,
    'CJS target should not be injected with `import ... from "diagnostics_channel"`')
})

test('unrecognized format falls through to "unknown" without throwing', async (t) => {
  const { esmLoaderRewriter } = t.ctx
  const cjsPath = path.join(import.meta.dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  async function resolveFn() {
    return { url: `file://${cjsPath}` }
  }
  async function nextLoad() {
    return {
      // Format the loader doesn't map to esm/cjs — Node may report 'json',
      // 'wasm', 'builtin', or any future addition. None should crash the hook.
      format: 'json',
      source: readFileSync(cjsPath, 'utf8')
    }
  }
  const url = await esmLoaderRewriter.resolve('pkg-1', {}, resolveFn)
  await assert.doesNotReject(() => esmLoaderRewriter.load(url.url, {}, nextLoad))
})
