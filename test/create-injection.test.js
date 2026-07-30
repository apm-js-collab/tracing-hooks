'use strict'

const test = require('node:test')
const path = require('node:path')
const { readFileSync } = require('node:fs')
const Module = require('node:module')

const ModulePatch = require('../index.js')

test('create function receives instrumentations array', (t) => {
  t.plan(2)

  const mockCreate = (instrumentations) => {
    t.assert.ok(Array.isArray(instrumentations), 'instrumentations should be an array')
    t.assert.strictEqual(instrumentations.length, 1, 'should receive one instrumentation')
    return {
      getTransformer: () => null
    }
  }

  const instrumentations = [
    {
      channelName: 'testChannel',
      module: { name: 'test-pkg', versionRange: '>=1.0.0', filePath: 'index.js' },
      functionQuery: { className: 'TestClass', methodName: 'testMethod' }
    }
  ]

  new ModulePatch({ instrumentations, create: mockCreate })
})

test('getTransformer is called with correct arguments', (t) => {
  t.plan(3)
  t.after(() => {
    modulePatch.unpatch()
  })

  const mockCreate = () => {
    return {
      getTransformer: (name, version, filePath) => {
        t.assert.strictEqual(name, 'pkg-1', 'package name should be pkg-1')
        t.assert.ok(version, 'version should be provided')
        t.assert.strictEqual(filePath, 'foo.js', 'filePath should be foo.js')
        return null
      }
    }
  }

  const instrumentations = [
    {
      channelName: 'testChannel',
      module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
      functionQuery: { className: 'Foo', methodName: 'doStuff' }
    }
  ]

  const modulePatch = new ModulePatch({ instrumentations, create: mockCreate })
  modulePatch.patch()

  const modulePath = path.join(__dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  const data = readFileSync(resolvedPath, 'utf8')
  const testModule = new Module(resolvedPath)
  testModule._compile(data, resolvedPath)
})

test('transformer.transform is called with correct arguments', (t) => {
  t.plan(3)
  t.after(() => {
    modulePatch.unpatch()
  })

  const mockCreate = () => {
    return {
      getTransformer: () => {
        return {
          transform: (content, format) => {
            t.assert.ok(typeof content === 'string', 'content should be a string')
            t.assert.ok(content.length > 0, 'content should not be empty')
            t.assert.strictEqual(format, 'cjs', 'format should be cjs')
            return { code: content }
          },
          free: () => {}
        }
      }
    }
  }

  const instrumentations = [
    {
      channelName: 'testChannel',
      module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
      functionQuery: { className: 'Foo', methodName: 'doStuff' }
    }
  ]

  const modulePatch = new ModulePatch({ instrumentations, create: mockCreate })
  modulePatch.patch()

  const modulePath = path.join(__dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  const data = readFileSync(resolvedPath, 'utf8')
  const testModule = new Module(resolvedPath)
  testModule._compile(data, resolvedPath)
})

test('transformer.free is called after transform', (t) => {
  t.plan(2)
  t.after(() => {
    modulePatch.unpatch()
  })

  let transformCalled = false

  const mockCreate = () => {
    return {
      getTransformer: () => {
        return {
          transform: (content, format) => {
            transformCalled = true
            return { code: content }
          },
          free: () => {
            t.assert.ok(transformCalled, 'transform should be called before free')
            t.assert.ok(true, 'free should be called')
          }
        }
      }
    }
  }

  const instrumentations = [
    {
      channelName: 'testChannel',
      module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
      functionQuery: { className: 'Foo', methodName: 'doStuff' }
    }
  ]

  const modulePatch = new ModulePatch({ instrumentations, create: mockCreate })
  modulePatch.patch()

  const modulePath = path.join(__dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  const data = readFileSync(resolvedPath, 'utf8')
  const testModule = new Module(resolvedPath)
  testModule._compile(data, resolvedPath)
})

test('transformer.free is called even when transform throws', (t) => {
  t.plan(2)
  t.after(() => {
    modulePatch.unpatch()
  })

  const mockCreate = () => {
    return {
      getTransformer: () => {
        return {
          transform: () => {
            t.assert.ok(true, 'transform should be called')
            throw new Error('Transform error')
          },
          free: () => {
            t.assert.ok(true, 'free should be called even when transform throws')
          }
        }
      }
    }
  }

  const instrumentations = [
    {
      channelName: 'testChannel',
      module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
      functionQuery: { className: 'Foo', methodName: 'doStuff' }
    }
  ]

  const modulePatch = new ModulePatch({ instrumentations, create: mockCreate })
  modulePatch.patch()

  const modulePath = path.join(__dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  const data = readFileSync(resolvedPath, 'utf8')
  const testModule = new Module(resolvedPath)
  // Should not throw - error is caught internally
  testModule._compile(data, resolvedPath)
})

test('getTransformer not called for non-instrumented packages', (t) => {
  t.plan(1)
  t.after(() => {
    modulePatch.unpatch()
  })

  const mockCreate = () => {
    return {
      getTransformer: () => {
        t.assert.fail('getTransformer should not be called for non-instrumented packages')
        return null
      }
    }
  }

  const instrumentations = [
    {
      channelName: 'testChannel',
      module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
      functionQuery: { className: 'Foo', methodName: 'doStuff' }
    }
  ]

  const modulePatch = new ModulePatch({ instrumentations, create: mockCreate })
  modulePatch.patch()

  // Try to compile a different package
  const modulePath = path.join(__dirname, './example-deps/lib/node_modules/pkg-2/index.js')
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  const data = readFileSync(resolvedPath, 'utf8')
  const testModule = new Module(resolvedPath)
  testModule._compile(data, resolvedPath)

  t.assert.ok(testModule.exports, 'module should compile successfully')
})

test('mock create function can return transformed code', (t) => {
  t.plan(3)
  t.after(() => {
    modulePatch.unpatch()
  })

  const mockCreate = () => {
    return {
      getTransformer: () => {
        return {
          transform: (content) => {
            t.assert.ok(content.includes('class Foo'), 'original content should contain Foo class')
            const transformed = `/* TRANSFORMED */\n${content}`
            t.assert.ok(transformed.startsWith('/* TRANSFORMED */'), 'transformed code should have comment')
            return { code: transformed }
          },
          free: () => {}
        }
      }
    }
  }

  const instrumentations = [
    {
      channelName: 'testChannel',
      module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
      functionQuery: { className: 'Foo', methodName: 'doStuff' }
    }
  ]

  const modulePatch = new ModulePatch({ instrumentations, create: mockCreate })
  modulePatch.patch()

  const modulePath = path.join(__dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  const data = readFileSync(resolvedPath, 'utf8')
  const testModule = new Module(resolvedPath)
  testModule._compile(data, resolvedPath)

  t.assert.ok(testModule.exports, 'module should export successfully')
})

test('getTransformer returns null for non-matching transformer', (t) => {
  t.plan(2)
  t.after(() => {
    modulePatch.unpatch()
  })

  const mockCreate = () => {
    return {
      getTransformer: (name, version, filePath) => {
        t.assert.strictEqual(name, 'pkg-1', 'should be called with pkg-1')
        t.assert.strictEqual(filePath, 'foo.js', 'should be called with foo.js')
        // Return null to simulate no matching transformer
        return null
      }
    }
  }

  const instrumentations = [
    {
      channelName: 'testChannel',
      module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
      functionQuery: { className: 'NonExistent', methodName: 'nonExistent' }
    }
  ]

  const modulePatch = new ModulePatch({ instrumentations, create: mockCreate })
  modulePatch.patch()

  const modulePath = path.join(__dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  const data = readFileSync(resolvedPath, 'utf8')
  const testModule = new Module(resolvedPath)
  testModule._compile(data, resolvedPath)
})

test('transform receives exact file content', (t) => {
  t.plan(2)
  t.after(() => {
    modulePatch.unpatch()
  })

  const modulePath = path.join(__dirname, './example-deps/lib/node_modules/pkg-1/foo.js')
  const resolvedPath = Module._resolveFilename(modulePath, null, false)
  const expectedContent = readFileSync(resolvedPath, 'utf8')

  const mockCreate = () => {
    return {
      getTransformer: () => {
        return {
          transform: (content, format) => {
            t.assert.strictEqual(content, expectedContent, 'content should match original file')
            t.assert.strictEqual(format, 'cjs', 'format should be cjs')
            return { code: content }
          },
          free: () => {}
        }
      }
    }
  }

  const instrumentations = [
    {
      channelName: 'testChannel',
      module: { name: 'pkg-1', versionRange: '>=1', filePath: 'foo.js' },
      functionQuery: { className: 'Foo', methodName: 'doStuff' }
    }
  ]

  const modulePatch = new ModulePatch({ instrumentations, create: mockCreate })
  modulePatch.patch()

  const data = readFileSync(resolvedPath, 'utf8')
  const testModule = new Module(resolvedPath)
  testModule._compile(data, resolvedPath)
})
