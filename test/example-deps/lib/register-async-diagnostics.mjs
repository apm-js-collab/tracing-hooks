// The Node < 24.13 registration with diagnostics wired up: ESM transforms happen on
// the `Module.register` loader thread and post their diagnostics back over the
// MessagePort from createDiagnosticsPort(), while CJS transforms happen in the
// `_compile` patch on this thread and reach the same hook directly.
import Module, { createRequire } from 'node:module'
import { setDiagnosticsHook, createDiagnosticsPort } from '../../../hook.mjs'
import { instrumentations } from './instrumentations.mjs'

const ModulePatch = createRequire(import.meta.url)('../../../index.js')

globalThis.__diagnostics = []
setDiagnosticsHook(({ url, moduleName, error }) => {
  globalThis.__diagnostics.push({ url, moduleName, error: error?.message })
})

const diagnosticsPort = createDiagnosticsPort()
Module.register('../../../hook.mjs', import.meta.url, {
  data: { instrumentations, diagnosticsPort },
  transferList: [diagnosticsPort]
})
new ModulePatch({ instrumentations }).patch()
