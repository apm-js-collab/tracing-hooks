// Imports one package of every module shape, calls the instrumented method on
// each, and reports on stdout what ran and which tracing channel events fired.
// A module transformed with the wrong injection style fails here: `require()`
// in an ES module throws `ReferenceError: require is not defined`, and
// `import` in a CommonJS module is a syntax error.
import { tracingChannel } from 'node:diagnostics_channel'
import { names } from './instrumentations.mjs'

const events = []
const results = {}

for (const name of names) {
  tracingChannel(`orchestrion:${name}:doStuff`).subscribe({
    start: () => events.push(`${name}:start`),
    end: () => events.push(`${name}:end`)
  })
}

for (const name of names) {
  // Dynamic, so the subscriptions above are already in place: the transformed
  // code skips publishing when a channel has no subscribers.
  const { default: Foo } = await import(name)
  results[name] = new Foo().doStuff()
}

console.log(JSON.stringify({ results, events }))
