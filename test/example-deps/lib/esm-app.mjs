// Loads an instrumented package from ESM and reports, on stdout, what the target
// method returned and which tracing channel events fired. Run by
// `test/require-esm.test.mjs` in a child process with one of the `register-*.mjs`
// loaders passed to `--import`.
import { tracingChannel } from 'node:diagnostics_channel'

const scenarios = {
  // Instrumented CJS entry whose top-level require chain reaches `require(esm)`.
  'cjs-require-esm': {
    channel: 'orchestrion:cjs-entry-lib:use',
    async run() {
      const { default: Application } = await import('cjs-entry-lib')
      return new Application().use('middleware')
    }
  },
  // Instrumented ESM package: still transformed by the `load` hook itself.
  esm: {
    channel: 'orchestrion:esm-pkg:doStuff',
    async run() {
      const { default: Foo } = await import('esm-pkg/foo.js')
      return new Foo().doStuff()
    }
  }
}

const scenario = scenarios[process.argv[2]]
const events = []

// Subscribing before the dynamic import matters twice over: a static import would be
// hoisted above this, and the transformed code skips publishing when the channel has
// no subscribers.
tracingChannel(scenario.channel).subscribe({
  start: () => events.push('start'),
  end: () => events.push('end'),
  asyncStart: () => events.push('asyncStart'),
  asyncEnd: () => events.push('asyncEnd'),
  error: (ctx) => events.push(`error:${ctx.error?.message}`)
})

const result = await scenario.run()
console.log(JSON.stringify({ result, events }))
