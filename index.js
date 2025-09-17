'use strict'
const { create } = require('@apm-js-collab/code-transformer')
const Module = require('node:module')
const parse = require('module-details-from-path')
const getPackageVersion = require('./lib/get-package-version')
const debug = require('debug')('@apm-js-collab/tracing-hooks:module-patch')

class ModulePatch {
  constructor({ instrumentations = [] } = {}) {
    this.packages = new Set(instrumentations.map(i => i.module.name))
    this.instrumentator = create(instrumentations)
    this.transformers = new Map()
    this.resolve = Module._resolveFilename
    this.compile = Module.prototype._compile
  }

  /**
   * Patches the Node.js module class methods that are responsible for resolving filePaths and compiling code.
   * If a module is found that has an instrumentator, it will transform the code before compiling it
   * with tracing channel methods.
   */
  patch() {
    const self = this
    Module._resolveFilename = function wrappedResolveFileName() {
      const resolvedName = self.resolve.apply(this, arguments)
      const resolvedModule = parse(resolvedName)
      if (resolvedModule && self.packages.has(resolvedModule.name)) {
        const version = getPackageVersion(resolvedModule.basedir, resolvedModule.name)
        const transformer = self.instrumentator.getTransformer(resolvedModule.name, version, resolvedModule.path)
        if (transformer) {
          self.transformers.set(resolvedName, transformer)
        }
      }
      return resolvedName
    }

    Module.prototype._compile = function wrappedCompile(...args) {
      const [content, filename] = args
      if (self.transformers.has(filename)) {
        const transformer = self.transformers.get(filename)
        try {
          const transformedCode = transformer.transform(content, 'unknown')
          args[0] = transformedCode?.code
          if (process.env.TRACING_DUMP) {
            dump(args[0], filename)
          }
        } catch (error) {
          debug('Error transforming module %s: %o', filename, error)
        } finally {
          transformer.free()
        }
      }

      return self.compile.apply(this, args)
    }
  }

  /**
   * Clears all the transformers and restores the original Module methods that were wrapped.
   * **Note**: This is intended to be used in testing only.
   */
  unpatch() {
    this.transformers.clear()
    Module._resolveFilename = this.resolve
    Module.prototype._compile = this.compile
  }
}

function dump(code, filename) {
  const os = require('node:os')
  const path = require('node:path')
  const fs = require('node:fs')

  const base = process.env.TRACING_DUMP_DIR ?? os.tmpdir()
  const dirname = path.dirname(filename)
  const basename = path.basename(filename)
  const targetDir = path.join(base, dirname)
  const targetFile = path.join(targetDir, basename)

  debug('Dumping patched code to: %s', targetFile)
  fs.mkdirSync(targetDir, { recursive: true })
  fs.writeFileSync(targetFile, code)
}

module.exports = ModulePatch

