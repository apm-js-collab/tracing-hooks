// The Node < 24.12 registration: async hooks with `transformCjs: false`, so CommonJS
// is transformed by the `Module.prototype._compile` patch rather than on the loader's
// require(esm) bridge.
import Module, { createRequire } from 'node:module'
import { instrumentations } from './instrumentations.mjs'

const ModulePatch = createRequire(import.meta.url)('../../../index.js')

Module.register('../../../hook.mjs', import.meta.url, {
  data: { instrumentations, transformCjs: false }
})
new ModulePatch({ instrumentations }).patch()
