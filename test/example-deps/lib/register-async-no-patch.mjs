// Async hooks WITHOUT the `_compile` patch — an unsupported registration, used only to
// pin the consequence of deferring CommonJS: nothing transforms it, and in particular
// nothing crashes.
import Module from 'node:module'
import { instrumentations } from './instrumentations.mjs'

Module.register('../../../hook.mjs', import.meta.url, { data: { instrumentations } })
