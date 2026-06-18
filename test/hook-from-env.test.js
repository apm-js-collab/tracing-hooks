'use strict'

const test = require('node:test')
const path = require('node:path')
const os = require('node:os')
const {
  readFile,
  writeFile,
  mkdir,
  rm
} = require('node:fs/promises')

test('hook.mjs loads transformer from TRACING_TRANSFORMER_MODULE env var', async (t) => {
  t.plan(4)

  const testDir = path.join(os.tmpdir(), 'tracing-hooks-test', 'temp-transformer-test-' + Date.now())
  const mockTransformerPath = path.join(testDir, 'mock-transformer.mjs')

  t.after(async () => {
    await rm(testDir, { recursive: true, force: true })
    delete process.env.TRACING_TRANSFORMER_MODULE
  })

  await mkdir(testDir, { recursive: true })
  const mockTransformerCode = `
export function create(instrumentations) {
  return {
    getTransformer(name, version, filePath) {
      if (name === 'esm-pkg' && filePath === 'foo.js') {
        return {
          transform(content, format) {
            return { code: '/* CUSTOM TRANSFORMER */\\n' + content }
          },
          free() {},
          moduleName: name
        }
      }
      return null
    }
  }
}
`
  await writeFile(mockTransformerPath, mockTransformerCode, 'utf8')

  process.env.TRACING_TRANSFORMER_MODULE = mockTransformerPath

  const hookUrl = `../hook.mjs?test=${Date.now()}`
  const hook = await import(hookUrl)

  t.assert.ok(hook, 'hook module should load')
  t.assert.ok(typeof hook.initialize === 'function', 'should have initialize function')

  hook.initialize({
    instrumentations: [
      {
        channelName: 'envTest',
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

  t.assert.ok(result.source.includes('/* CUSTOM TRANSFORMER */'), 'should use custom transformer from env var')
  t.assert.strictEqual(result.shortCircuit, true, 'should short circuit')
})

test('hook.mjs defaults to @apm-js-collab/code-transformer when env var not set', async (t) => {
  t.plan(3)

  delete process.env.TRACING_TRANSFORMER_MODULE

  const hookUrl = `../hook.mjs?test=${Date.now()}`
  const hook = await import(hookUrl)

  t.assert.ok(hook, 'hook module should load')

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

test('custom transformer via env var exercises getTransformer with correct args', async (t) => {
  t.plan(4)

  const testDir = path.join(os.tmpdir(), 'tracing-hooks-test', 'temp-transformer-test-args-' + Date.now())
  const mockTransformerPath = path.join(testDir, 'mock-transformer-args.mjs')

  t.after(async () => {
    await rm(testDir, { recursive: true, force: true })
    delete process.env.TRACING_TRANSFORMER_MODULE
  })

  await mkdir(testDir, { recursive: true })
  const mockTransformerCode = `
export function create(instrumentations) {
  return {
    getTransformer(name, version, filePath) {
      if (name !== 'esm-pkg') throw new Error('Expected name to be esm-pkg')
      if (!version) throw new Error('Expected version to be provided')
      if (filePath !== 'foo.js') throw new Error('Expected filePath to be foo.js')

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
`
  await writeFile(mockTransformerPath, mockTransformerCode, 'utf8')

  process.env.TRACING_TRANSFORMER_MODULE = mockTransformerPath

  const hookUrl = `../hook.mjs?test=${Date.now()}`
  const hook = await import(hookUrl)

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

  await t.assert.doesNotReject(
    async () => await hook.load(url.url, {}, nextLoad),
    'custom transformer should receive correct arguments'
  )

  const result = await hook.load(url.url, {}, nextLoad)
  t.assert.strictEqual(result.shortCircuit, true, 'should transform successfully')
  t.assert.ok(result.source, 'should have transformed source')
  t.assert.strictEqual(result.format, 'module', 'should preserve module format')
})

test('custom transformer via env var exercises free method', async (t) => {
  t.plan(2)

  const testDir = path.join(os.tmpdir(), 'tracing-hooks-test', 'temp-transformer-test-free-' + Date.now())
  const mockTransformerPath = path.join(testDir, 'mock-transformer-free.mjs')
  const freeCallsPath = path.join(testDir, 'free-calls.json')

  t.after(async () => {
    await rm(testDir, { recursive: true, force: true })
    delete process.env.TRACING_TRANSFORMER_MODULE
  })

  await mkdir(testDir, { recursive: true })
  await writeFile(freeCallsPath, '0', 'utf8')

  const mockTransformerCode = `
import { readFileSync, writeFileSync } from 'node:fs'

export function create(instrumentations) {
  return {
    getTransformer(name, version, filePath) {
      return {
        transform(content, format) {
          return { code: content }
        },
        free() {
          const count = parseInt(readFileSync('${freeCallsPath}', 'utf8'))
          writeFileSync('${freeCallsPath}', String(count + 1), 'utf8')
        },
        moduleName: name
      }
    }
  }
}
`
  await writeFile(mockTransformerPath, mockTransformerCode, 'utf8')

  process.env.TRACING_TRANSFORMER_MODULE = mockTransformerPath

  const hookUrl = `../hook.mjs?test=${Date.now()}`
  const hook = await import(hookUrl)

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
  })

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

  const freeCalls = parseInt(await readFile(freeCallsPath, 'utf8'))
  t.assert.strictEqual(freeCalls, 1, 'free should be called once')

  await hook.load(url.url, {}, nextLoad)
  const freeCallsAfter = parseInt(await readFile(freeCallsPath, 'utf8'))
  t.assert.strictEqual(freeCallsAfter, 2, 'free should be called again on second load')
})

test('custom transformer via env var handles transform errors', async (t) => {
  t.plan(2)

  const testDir = path.join(os.tmpdir(), 'tracing-hooks-test', 'temp-transformer-test-error-' + Date.now())
  const mockTransformerPath = path.join(testDir, 'mock-transformer-error.mjs')
  const freeCallsPath = path.join(testDir, 'free-calls-error.json')

  t.after(async () => {
    await rm(testDir, { recursive: true, force: true })
    delete process.env.TRACING_TRANSFORMER_MODULE
  })

  await mkdir(testDir, { recursive: true })
  await writeFile(freeCallsPath, '0', 'utf8')

  const mockTransformerCode = `
import { readFileSync, writeFileSync } from 'node:fs'

export function create(instrumentations) {
  return {
    getTransformer(name, version, filePath) {
      return {
        transform(content, format) {
          throw new Error('Transform failed intentionally')
        },
        free() {
          const count = parseInt(readFileSync('${freeCallsPath}', 'utf8'))
          writeFileSync('${freeCallsPath}', String(count + 1), 'utf8')
        },
        moduleName: name
      }
    }
  }
}
`
  await writeFile(mockTransformerPath, mockTransformerCode, 'utf8')

  process.env.TRACING_TRANSFORMER_MODULE = mockTransformerPath

  const hookUrl = `../hook.mjs?test=${Date.now()}`
  const hook = await import(hookUrl)

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
  })

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

  const freeCalls = parseInt(await readFile(freeCallsPath, 'utf8'))
  t.assert.strictEqual(freeCalls, 1, 'free should still be called when transform throws')
})
