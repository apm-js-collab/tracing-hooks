// The Node >= 24.13 registration from the README: synchronous hooks only, no
// `_compile` patch — `Module.registerHooks` sees CommonJS and ESM alike.
import Module from 'node:module'
import { initialize, resolve, load } from '../../../hook-sync.mjs'
import { instrumentations } from './instrumentations.mjs'

initialize({ instrumentations })
Module.registerHooks({ resolve, load })
