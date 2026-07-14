'use strict'

const test = require('node:test')
const assert = require('node:assert')
const Module = require('node:module')
const Snap = require('@matteo.collina/snap')
const ModulePatch = require('../index.js')
const { setDiagnosticsHook } = require('../lib/diagnostics')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { readFileSync, mkdirSync, rmSync, statSync } = require('node:fs')

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
  assert.ok(modulePatch.compile, Module.prototype._compile)
})

test('should rewrite code for a match transformer', async (t) => {
  // cover the trace debugging dump code path
  const tracingDir = __dirname + '/trace'
  process.env.TRACING_DUMP = '1'
  process.env.TRACING_DUMP_DIR = tracingDir
  try {
    mkdirSync(__dirname + '/trace', { recursive: true })
    const { modulePath, modulePatch, snap } = t.ctx
    modulePatch.patch()
    const resolvedPath = Module._resolveFilename(modulePath, null, false)
    const data = readFileSync(resolvedPath, 'utf8')
    const testModule = new Module(resolvedPath)
    testModule._compile(data, resolvedPath)
    const rewrittenCode = testModule.exports.toString()
    const snapshot = await snap(rewrittenCode)
    assert.deepEqual(rewrittenCode, snapshot)
    const expectedDump = path.join(tracingDir, modulePath)
    assert.equal(statSync(expectedDump).isFile(), true)
  } finally {
    rmSync(tracingDir, { recursive: true, force: true })
  }
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

// The `_compile` patch is what transforms CommonJS on the async-hooks path, so it has
// to emit diagnostics too — the loader thread never sees these modules.
test('should emit diagnostics when a module is transformed', (t) => {
  const { modulePath, modulePatch } = t.ctx
  const diagnostics = []
  setDiagnosticsHook(diag => diagnostics.push(diag))
  t.after(() => setDiagnosticsHook(undefined))

  modulePatch.patch()
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  const data = readFileSync(resolvedPath, 'utf8')
  new Module(resolvedPath)._compile(data, resolvedPath)

  assert.deepEqual(diagnostics, [{ url: pathToFileURL(resolvedPath).href, moduleName: 'pkg-1' }])
})

test('should emit diagnostics with the error when transformation fails', (t) => {
  const { modulePath, modulePatch } = t.ctx
  const diagnostics = []
  setDiagnosticsHook(diag => diagnostics.push(diag))
  t.after(() => setDiagnosticsHook(undefined))

  modulePatch.patch()
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  // Unparseable source makes the transformer throw; `_compile` then also throws on it,
  // but the failure diagnostic must already have been emitted by then.
  assert.throws(() => new Module(resolvedPath)._compile('const {', resolvedPath))

  assert.equal(diagnostics.length, 1)
  assert.equal(diagnostics[0].url, pathToFileURL(resolvedPath).href)
  assert.equal(diagnostics[0].moduleName, 'pkg-1')
  assert.ok(diagnostics[0].error instanceof Error)
})

test('should not rewrite code if a function query does not exist in file', async (t) => {
  const { modulePath, snap } = t.ctx
  const subscribers = {
    instrumentations: [
      {
        channelName: 'unitTest',
        module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
        functionQuery: {
          className: 'Blah',
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
