'use strict'
const { initializeSync, loadSync, resolveSync, setDiagnosticsHook, createDiagnosticsPort } = require('./hook-core.js')
module.exports = { initialize: initializeSync, load: loadSync, resolve: resolveSync, setDiagnosticsHook, createDiagnosticsPort }
