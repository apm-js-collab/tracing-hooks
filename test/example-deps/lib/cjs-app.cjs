// CommonJS counterpart of `esm-app.mjs`: an instrumented CJS package reached by
// `require`, which never touches the ESM loader hooks at all.
'use strict'
const { tracingChannel } = require('node:diagnostics_channel')

const events = []
tracingChannel('orchestrion:cjs-plain-lib:greet').subscribe({
  start: () => events.push('start'),
  end: () => events.push('end')
})

const Greeter = require('cjs-plain-lib')
const result = new Greeter().greet('world')
console.log(JSON.stringify({ result, events }))
