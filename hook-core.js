'use strict'
const createDebug = require('debug')
const { create } = require('@apm-js-collab/code-transformer')
const parse = require('module-details-from-path')
const { fileURLToPath } = require('node:url')
const { MessageChannel } = require('node:worker_threads')
const { readFileSync } = require('node:fs')
const getPackageVersion = require('./lib/get-package-version.js')
const { setDiagnosticsHook, emitDiagnostics } = require('./lib/diagnostics.js')

const debug = createDebug('@apm-js-collab/tracing-hooks:esm-hook')
let transformers = null
let packages = null
let instrumentator = null

// On the main thread diagnostics go straight to the hook set via
// `setDiagnosticsHook`. When these hooks run on the `Module.register` loader
// thread, `initializeSync` swaps this for a function that posts back over the
// MessagePort supplied in `data.diagnosticsPort`.
let emit = emitDiagnostics

function initializeSync(data = {}) {
  const instrumentations = data?.instrumentations || []
  instrumentator = create(instrumentations)
  packages = new Set(instrumentations.map(i => i.module.name))
  transformers = new Map()
  emit = data?.diagnosticsPort ? createPortEmitter(data.diagnosticsPort) : emitDiagnostics
}

function createPortEmitter(port) {
  return (diag) => {
    try {
      // Structured clone reliably carries Error instances but not arbitrary thrown
      // values, so flatten anything else to an Error rather than let postMessage
      // throw inside the load path.
      const error = diag.error === undefined || diag.error instanceof Error
        ? diag.error
        : new Error(String(diag.error))
      port.postMessage({ ...diag, error })
    } catch (err) {
      debug('failed to post diagnostics for %s: %o', diag.url, err)
    }
  }
}

/**
 * Creates a MessagePort that forwards diagnostics posted by the `Module.register`
 * loader thread to the hook set via `setDiagnosticsHook` on this thread. Pass the
 * returned port to `Module.register` in both `data.diagnosticsPort` and
 * `transferList`.
 */
function createDiagnosticsPort() {
  const { port1, port2 } = new MessageChannel()
  port1.on('message', emitDiagnostics)
  // The diagnostics channel must not keep the process alive.
  port1.unref()
  return port2
}

function resolveFromURL(url) {
  const resolvedModule = parse(url.url)
  if (resolvedModule && packages.has(resolvedModule.name)) {
    const path = fileURLToPath(resolvedModule.basedir)
    const version = getPackageVersion(path)
    const transformer = instrumentator.getTransformer(resolvedModule.name, version, resolvedModule.path)
    if (transformer) {
      transformers.set(url.url, transformer)
    }
  }
  return url
}

function resolveSync(specifier, context, nextResolve) {
  return resolveFromURL(nextResolve(specifier, context))
}

function hasTransformer(url) {
  return transformers.has(url)
}

// The async `load` hook in hook.mjs hands CommonJS back untransformed so Node loads it
// through the ordinary CJS loader, where the `_compile` patch transforms it instead.
// `resolve` has already put a transformer in the map for this URL and nothing
// downstream will free it, so this frees it on that deferral path.
function deferCommonJSTransform(url) {
  debug('deferring commonjs module to the _compile patch %s', url)
  const transformer = transformers.get(url)
  transformer.free()
  transformers.delete(url)
}

// Unlike the async `load` hook in hook.mjs, this one must transform CommonJS: the sync hooks
// are never paired with a `_compile` patch, so they are the only thing that can, and
// they don't evaluate CommonJS on the require(esm) bridge.
function loadSync(url, context, nextLoad) {
  const result = nextLoad(url, context)

  if (hasTransformer(url) === false) {
    return result
  }

  if (result.format === 'commonjs') {
    const parsedUrl = new URL(result.responseURL ?? url)
    result.source ??= readFileSync(parsedUrl)
  }

  return loadResult(url, result)
}

function loadResult(url, result) {
  const code = result.source
  if (code) {
    const transformer = transformers.get(url)
    try {
      const moduleType = result.format === 'module' ? 'esm' :
        result.format === 'commonjs' ? 'cjs' : 'unknown'
      // Node's synchronous hooks (`Module.registerHooks`) deliver `source` as a plain `Uint8Array`,
      // whereas the async loader delivers a `Buffer`. `Uint8Array.prototype.toString('utf8')` ignores
      // the encoding and returns comma-joined byte values instead of the decoded text, so decode via
      // `Buffer` for anything that isn't already a string.
      const source = typeof code === 'string' ? code : Buffer.from(code).toString('utf8')
      const transformedCode = transformer.transform(source, moduleType)
      result.source = transformedCode?.code
      result.shortCircuit = true
      emit({ url, moduleName: transformer.moduleName })
    } catch (err) {
      debug('Error transforming module %s: %o', url, err)
      emit({ url, moduleName: transformer.moduleName, error: err })
    } finally {
      transformer.free()
    }
  }

  return result
}

module.exports = {
  initializeSync,
  resolveSync,
  loadSync,
  resolveFromURL,
  loadResult,
  createPortEmitter,
  createDiagnosticsPort,
  setDiagnosticsHook,
  hasTransformer,
  deferCommonJSTransform
}
