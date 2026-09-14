// The synchronous hooks on their own, which is all Deno offers and what the
// README tells Node >= 24.13 to use.
import Module from 'node:module'
import { initialize, resolve, load } from '../../hook-sync.mjs'
import { instrumentations } from './instrumentations.mjs'

initialize({ instrumentations })
Module.registerHooks({ resolve, load })
