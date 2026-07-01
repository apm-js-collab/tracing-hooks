'use strict'

const test = require('node:test')
const path = require('node:path')
const { readFile } = require('node:fs/promises')

test('hook.mjs accepts custom create function via initialize options', async (t) => {
  t.plan(2)

  const mockCreate = (instrumentations) => {
    return {
      getTransformer(name, version, filePath) {
        if (name === 'esm-pkg' && filePath === 'foo.js') {
          return {
            transform(content, format) {
              return { code: '/* CUSTOM TRANSFORMER */\n' + content }
            },
            free() {},
            moduleName: name
          }
        }
        return null
      }
    }
  }

  const hook = await import('../hook.mjs?' + Date.now())

  hook.initialize({
    instrumentations: [
      {
        channelName: 'createTest',
        module: { name: 'esm-pkg', versionRange: '>=1', filePath: 'foo.js' },
        functionQuery: {
          className: 'Foo',
          methodName: 'doStuff',
          kind: 'Async'
        }
      }
    ]
  }, { create: mockCreate })

  const esmPath = path.join(__dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  async function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  async function nextLoad() {
    const data = await readFile(esmPath, 'utf8')
    return {
      format: 'module',
      source: data
    }
  }

  const url = await hook.resolve('esm-pkg', {}, resolveFn)
  const result = await hook.load(url.url, {}, nextLoad)

  t.assert.ok(result.source.includes('/* CUSTOM TRANSFORMER */'), 'should use custom create function')
  t.assert.strictEqual(result.shortCircuit, true, 'should short circuit')
})

test('hook.mjs defaults to @apm-js-collab/code-transformer when create not provided', async (t) => {
  t.plan(2)

  const hook = await import('../hook.mjs?' + Date.now())

  hook.initialize({
    instrumentations: [
      {
        channelName: 'defaultTest',
        module: { name: 'esm-pkg', versionRange: '>=1', filePath: 'foo.js' },
        functionQuery: {
          className: 'Foo',
          methodName: 'doStuff',
          kind: 'Async'
        }
      }
    ]
  })

  const esmPath = path.join(__dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  async function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  async function nextLoad() {
    const data = await readFile(esmPath, 'utf8')
    return {
      format: 'module',
      source: data
    }
  }

  const url = await hook.resolve('esm-pkg', {}, resolveFn)
  const result = await hook.load(url.url, {}, nextLoad)

  t.assert.strictEqual(result.shortCircuit, true, 'should transform using default transformer')
  t.assert.ok(result.source.includes('diagnostics_channel'), 'should include diagnostics_channel from default transformer')
})

test('custom create function exercises getTransformer with correct args', async (t) => {
  t.plan(4)

  const mockCreate = (instrumentations) => {
    t.assert.strictEqual(instrumentations.length, 1, 'should receive one instrumentation')
    return {
      getTransformer(name, version, filePath) {
        t.assert.strictEqual(name, 'esm-pkg', 'name should be esm-pkg')
        t.assert.ok(version, 'version should be provided')
        t.assert.strictEqual(filePath, 'foo.js', 'filePath should be foo.js')

        return {
          transform(content, format) {
            if (format !== 'esm') throw new Error('Expected format to be esm')
            return { code: content }
          },
          free() {},
          moduleName: name
        }
      }
    }
  }

  const hook = await import('../hook.mjs?' + Date.now())

  hook.initialize({
    instrumentations: [
      {
        channelName: 'argsTest',
        module: { name: 'esm-pkg', versionRange: '>=1', filePath: 'foo.js' },
        functionQuery: {
          className: 'Foo',
          methodName: 'doStuff',
          kind: 'Async'
        }
      }
    ]
  }, { create: mockCreate })

  const esmPath = path.join(__dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  async function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  async function nextLoad() {
    const data = await readFile(esmPath, 'utf8')
    return {
      format: 'module',
      source: data
    }
  }

  const url = await hook.resolve('esm-pkg', {}, resolveFn)
  await hook.load(url.url, {}, nextLoad)
})

test('custom create function exercises free method', async (t) => {
  t.plan(2)

  let freeCalls = 0

  const mockCreate = () => {
    return {
      getTransformer(name, version, filePath) {
        return {
          transform(content, format) {
            return { code: content }
          },
          free() {
            freeCalls++
          },
          moduleName: name
        }
      }
    }
  }

  const hook = await import('../hook.mjs?' + Date.now())

  hook.initialize({
    instrumentations: [
      {
        channelName: 'freeTest',
        module: { name: 'esm-pkg', versionRange: '>=1', filePath: 'foo.js' },
        functionQuery: {
          className: 'Foo',
          methodName: 'doStuff'
        }
      }
    ]
  }, { create: mockCreate })

  const esmPath = path.join(__dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  async function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  async function nextLoad() {
    return {
      format: 'module',
      source: await readFile(esmPath, 'utf8')
    }
  }

  const url = await hook.resolve('esm-pkg', {}, resolveFn)
  await hook.load(url.url, {}, nextLoad)

  t.assert.strictEqual(freeCalls, 1, 'free should be called once')

  await hook.load(url.url, {}, nextLoad)
  t.assert.strictEqual(freeCalls, 2, 'free should be called again on second load')
})

test('custom create function handles transform errors', async (t) => {
  t.plan(2)

  let freeCalled = false

  const mockCreate = () => {
    return {
      getTransformer(name, version, filePath) {
        return {
          transform(content, format) {
            throw new Error('Transform failed intentionally')
          },
          free() {
            freeCalled = true
          },
          moduleName: name
        }
      }
    }
  }

  const hook = await import('../hook.mjs?' + Date.now())

  hook.initialize({
    instrumentations: [
      {
        channelName: 'errorTest',
        module: { name: 'esm-pkg', versionRange: '>=1', filePath: 'foo.js' },
        functionQuery: {
          className: 'Foo',
          methodName: 'doStuff'
        }
      }
    ]
  }, { create: mockCreate })

  const esmPath = path.join(__dirname, './example-deps/lib/node_modules/esm-pkg/foo.js')
  async function resolveFn() {
    return { url: `file://${esmPath}` }
  }
  async function nextLoad() {
    return {
      format: 'module',
      source: await readFile(esmPath, 'utf8')
    }
  }

  const url = await hook.resolve('esm-pkg', {}, resolveFn)

  await t.assert.doesNotReject(
    async () => await hook.load(url.url, {}, nextLoad),
    'should handle transform errors gracefully'
  )

  t.assert.strictEqual(freeCalled, true, 'free should still be called when transform throws')
})
