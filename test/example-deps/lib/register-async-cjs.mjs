// Async hooks with the default `transformCjs: true` and no `_compile` patch, so the
// `load` hook is the only thing that can transform CommonJS. Safe on Node >= 24.12.
import Module from 'node:module'
import { instrumentations } from './instrumentations.mjs'

Module.register('../../../hook.mjs', import.meta.url, { data: { instrumentations } })
