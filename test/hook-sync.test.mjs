'use strict'
import test from 'node:test'
import assert from 'node:assert'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import Snap from '@matteo.collina/snap'

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