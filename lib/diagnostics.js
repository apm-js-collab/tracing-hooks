'use strict'

// Main-thread diagnostics state shared by everything that can transform a module on
// this thread: the ESM hooks (hook.mjs / hook-sync.mjs) and the
// `Module.prototype._compile` patch (index.js). One CJS module holds the hook so
// setting it once covers all of them. The `Module.register` loader thread gets its
// own copy of this module where the hook is never set — diagnostics from that thread
// arrive over a MessagePort instead (see createDiagnosticsPort in hook.mjs).

let diagnosticsHook

function setDiagnosticsHook(hook) {
  diagnosticsHook = hook
}

function emitDiagnostics(diag) {
  if (diagnosticsHook) {
    diagnosticsHook(diag)
  }
}

module.exports = { setDiagnosticsHook, emitDiagnostics }
