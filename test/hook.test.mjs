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
            className: 'Foo',
            methodName: 'nonExistentMethod',
            kind: 'Async'
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
