'use strict'
import createDebug from 'debug'
import { create } from '@apm-js-collab/code-transformer'
import parse from 'module-details-from-path'
import { fileURLToPath } from 'node:url'
import getPackageVersion from './lib/get-package-version.js'
import { readFileSync } from 'node:fs'
const debug = createDebug('@apm-js-collab/tracing-hooks:esm-hook')
let transformers = null
let packages = null
let instrumentator = null

let diagnosticsHook

export function setDiagnosticsHook(hook) {
  diagnosticsHook = hook
}

export async function initialize(data = {}) {
  return initializeSync(data)
}
export function initializeSync(data = {}) {
  const instrumentations = data?.instrumentations || []
  instrumentator = create(instrumentations)
  packages = new Set(instrumentations.map(i => i.module.name))
  transformers = new Map()
}

export async function resolve(specifier, context, nextResolve) {
  return resolveFromURL(await nextResolve(specifier, context))
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
export function resolveSync(specifier, context, nextResolve) {
  return resolveFromURL(nextResolve(specifier, context))
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)

  if (transformers.has(url) === false) {
    return result
  }

  if (result.format === 'commonjs') {
    // CommonJS is always left to the `Module.prototype._compile` patch
    // (`ModulePatch`), which these hooks are only ever registered alongside.
    // Returning `source` for a CommonJS module instead makes Node evaluate it on the
    // synchronous require(esm) bridge, which throws ERR_VM_MODULE_LINK_FAILURE on
    // Node < 24.12 when the module's top-level require() chain reaches an ES module
    // (https://github.com/nodejs/node/issues/59666). Handing the module back exactly
    // as Node produced it (`source` is null) sends it down the ordinary CommonJS
    // loader, where `_compile` transforms it.
    //
    // `resolve` has already put a transformer in the map for this URL and nothing
    // downstream will free it, so do that here.
    debug('deferring commonjs module to the _compile patch %s', url)
    const transformer = transformers.get(url)
    transformer.free()
    transformers.delete(url)
    return result
  }

  return loadResult(url, result)
}

// Unlike the async `load` hook above, this one must transform CommonJS: the sync hooks
// are never paired with a `_compile` patch, so they are the only thing that can, and
// they don't evaluate CommonJS on the require(esm) bridge.
export function loadSync(url, context, nextLoad) {
  const result = nextLoad(url, context)

  if (transformers.has(url) === false) {
    return result
  }

  if (result.format === 'commonjs') {
    const parsedUrl = new URL(result.responseURL ?? url)
    result.source ??= readFileSync(parsedUrl)
  }

  return loadResult(url, result)
}

export function loadResult(url, result) {
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
      if (diagnosticsHook) {
        diagnosticsHook({ url, moduleName: transformer.moduleName })
      }
    } catch (err) {
      debug('Error transforming module %s: %o', url, err)
      if (diagnosticsHook) {
        diagnosticsHook({ url, moduleName: transformer.moduleName, error: err })
      }
    } finally {
      transformer.free()
    }
  }

  return result
}