'use strict'
import test from 'node:test'
import assert from 'node:assert'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { names } from './module-types/instrumentations.mjs'

const execFileAsync = promisify(execFile)

const appDir = path.join(import.meta.dirname, 'module-types')

// `Module.registerHooks` became stable in 24.13 / 25.1, the boundary the README
// tells consumers to switch on.
const [major, minor] = process.versions.node.split('.').map(n => parseInt(n, 10))
const stableSyncHooks = major > 25 || (major === 25 && minor >= 1) || (major === 24 && minor >= 13)

// Deno is not a test dependency. Run the Deno half only where it is installed.
let hasDeno = false
try {
  await execFileAsync('deno', ['--version'])
  hasDeno = true
} catch {}

// Every package in `module-types/node_modules` exports the same `Foo.doStuff`,
// so a successful run returns the package's own name from each one and fires a
// start/end pair per package, in import order.
const expectedResults = Object.fromEntries(names.map(n => [n, n]))
const expectedEvents = names.flatMap(n => [`${n}:start`, `${n}:end`])

async function runApp(command, args) {
  const { stdout } = await execFileAsync(command, args, { cwd: appDir })
  return JSON.parse(stdout)
}

// The sync hooks must pick the injection style from the module itself, not from
// the runtime. Deno's `Module.registerHooks` reports no `format` at all, for ESM
// and CommonJS alike, so everything here rests on the file extension, the
// nearest package.json `"type"`, and the source. Get it wrong and the module
// throws on load: `ReferenceError: require is not defined` in an ES module,
// `ReferenceError: module is not defined` in a CommonJS one (issue #53).
test('sync hooks instrument every module shape', async (t) => {
  await t.test('on Node', { skip: !stableSyncHooks }, async () => {
    const { results, events } = await runApp(process.execPath,
      ['--import', './register.mjs', './app.mjs'])

    assert.deepEqual(results, expectedResults)
    assert.deepEqual(events, expectedEvents)
  })

  // Deno loads CommonJS from a `.cjs` file, from a package with
  // `"type": "commonjs"`, and from a bare `.js` file under node_modules. The
  // fixture has one package of each, next to ESM by `"type"` and by `.mjs`, and
  // a CommonJS package whose `dist/package.json` flips the subdirectory to ESM.
  await t.test('on Deno', { skip: !hasDeno }, async () => {
    const { results, events } = await runApp('deno',
      ['run', '-A', '--node-modules-dir=manual', '--preload=./register.mjs', './app.mjs'])

    assert.deepEqual(results, expectedResults)
    assert.deepEqual(events, expectedEvents)
  })
})
