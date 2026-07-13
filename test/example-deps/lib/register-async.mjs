// The Node < 24.13 registration from the README: async hooks via `Module.register`
// plus the `Module.prototype._compile` patch, which is what transforms CommonJS.
import Module, { createRequire } from 'node:module'
import { instrumentations } from './instrumentations.mjs'

const ModulePatch = createRequire(import.meta.url)('../../../index.js')

Module.register('../../../hook.mjs', import.meta.url, { data: { instrumentations } })
new ModulePatch({ instrumentations }).patch()
