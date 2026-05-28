'use strict'
import createDebug from 'debug'
import { readFile } from 'node:fs/promises'
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
    const parsedUrl = new URL(result.responseURL ?? url)
    result.source ??= await readFile(parsedUrl)
    /* c8 ignore next - mysteriously uncovered closing brace? */
  }

  return loadResult(url, result)
}

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
      const transformedCode = transformer.transform(code.toString('utf8'), moduleType)
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