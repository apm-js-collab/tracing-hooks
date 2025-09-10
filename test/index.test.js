'use strict'

const test = require('node:test')
const assert = require('node:assert')
const Module = require('node:module')
const Snap = require('@matteo.collina/snap')
const ModulePatch = require('../index.js')
const path = require('node:path')
const { readFileSync } = require('node:fs')

test.beforeEach((t) => {
  const subscribers = {
    instrumentations: [
      {
        channelName: 'unitTest',
        module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
        functionQuery: {
          className: 'Foo',
          methodName: 'doStuff',
          kind: 'Async'
        }
      }
    ]
  }
  const modulePath = path.join(__dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  const modulePatch = new ModulePatch(subscribers)
  const snap = Snap(`${__filename}/${t.name}`)
  t.ctx = {
    snap,
    subscribers,
    modulePatch,
    modulePath
  }
})

test.afterEach((t) => {
  t.ctx.modulePatch.unpatch()
})

test('should init ModulePatch', (t) => {
  const { modulePatch } = t.ctx
  assert.ok(modulePatch instanceof ModulePatch)
  assert.ok(modulePatch.instrumentator)
  assert.equal(modulePatch.resolve, Module._resolveFilename)
  assert.ok(modulePatch.compile, Module.prototype._compile)
  assert.ok(modulePatch.transformers instanceof Map)
})

test('should set a transformer for a matched patch', (t) => {
  const { modulePath, modulePatch } = t.ctx
  modulePatch.patch()
  Module._resolveFilename(modulePath, null, false)
  assert.ok(modulePatch.transformers.has(modulePath))
  modulePatch.unpatch()
  assert.equal(modulePatch.transformers.size, 0)
})

test('should not set a transformer for an unmatched patch', (t) => {
  const { modulePatch } = t.ctx
  modulePatch.patch()
  const modulePath = path.join(__dirname, './example-deps/lib/node_modules/pkg-2/index.js')
  Module._resolveFilename(modulePath, null, false)
  assert.equal(modulePatch.transformers.size, 0)
})

test('should rewrite code for a match transformer', async (t) => {
  const { modulePath, modulePatch, snap } = t.ctx
  modulePatch.patch()
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  const data = readFileSync(resolvedPath, 'utf8')
  const testModule = new Module(resolvedPath)
  testModule._compile(data, resolvedPath)
  const rewrittenCode = testModule.exports.toString()
  const snapshot = await snap(rewrittenCode)
  assert.deepEqual(rewrittenCode, snapshot)
})

test('should not rewrite code for an unmatch patch', async (t) => {
  const { modulePatch, snap } = t.ctx
  modulePatch.patch()
  const modulePath = path.join(__dirname, './example-deps/lib/node_modules/pkg-2/index.js')
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  const data = readFileSync(resolvedPath, 'utf8')
  const testModule = new Module(resolvedPath)
  testModule._compile(data, resolvedPath)
  const rewrittenCode = testModule.exports.toString()
  const snapshot = await snap(rewrittenCode)
  assert.deepEqual(rewrittenCode, snapshot)
})

test('should not rewrite code if a function query does not exist in file', async (t) => {
  const { modulePath, snap } = t.ctx
  const subscribers = {
    instrumentations: [
      {
        channelName: 'unitTest',
        module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
        functionQuery: {
          className: 'Foo',
          methodName: 'nonExistentMethod',
          kind: 'Async'
        }
      }
    ]
  }
  const modulePatch = new ModulePatch(subscribers)
  modulePatch.patch()
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  const data = readFileSync(resolvedPath, 'utf8')
  const testModule = new Module(resolvedPath)
  testModule._compile(data, resolvedPath)
  const rewrittenCode = testModule.exports.toString()
  const snapshot = await snap(rewrittenCode)
  assert.deepEqual(rewrittenCode, snapshot)
})
