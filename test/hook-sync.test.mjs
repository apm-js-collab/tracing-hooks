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
