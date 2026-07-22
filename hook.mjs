'use strict'
import {
  initializeSync,
  resolveSync,
  loadSync,
  resolveFromURL,
  loadResult,
  createDiagnosticsPort,
  setDiagnosticsHook,
  hasTransformer,
  deferCommonJSTransform
} from './hook-core.js'

export { initializeSync, resolveSync, loadSync, loadResult, setDiagnosticsHook, createDiagnosticsPort }

export async function initialize(data = {}) {
  return initializeSync(data)
}

export async function resolve(specifier, context, nextResolve) {
  return resolveFromURL(await nextResolve(specifier, context))
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)

  if (hasTransformer(url) === false) {
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
    deferCommonJSTransform(url)
    return result
  }

  return loadResult(url, result)
}
