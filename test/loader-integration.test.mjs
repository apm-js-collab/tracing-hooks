'use strict'
import test from 'node:test'
import assert from 'node:assert'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const appDir = path.join(import.meta.dirname, 'example-deps/lib')

// `Module.registerHooks` exists earlier but only became stable in 24.13 / 25.1, which is
// the boundary the README tells consumers to switch on. Below it, the async hooks and
// the `_compile` patch are used together.
const [major, minor] = process.versions.node.split('.').map(n => parseInt(n, 10))
const stableSyncHooks = major > 25 || (major === 25 && minor >= 1) || (major === 24 && minor >= 13)

/**
 * Runs one of the `example-deps/lib` apps in a child process under the given loader and
 * returns what it reported: the target method's return value and the tracing channel
 * events it observed.
 */
async function runApp(loader, app, scenario) {
  const args = ['--import', `./${loader}`, `./${app}`]
  if (scenario) args.push(scenario)
  const { stdout } = await execFileAsync(process.execPath, args, { cwd: appDir })
  return JSON.parse(stdout)
}

test('async hooks + the _compile patch', async (t) => {
  // The regression. When the async `load` hook returned `source` for CommonJS, Node
  // evaluated this module on the synchronous require(esm) bridge and linking
  // `esm-require-dep`'s nested `import './sub.mjs'` failed with
  // ERR_VM_MODULE_LINK_FAILURE (nodejs/node#59666), so the app exited non-zero on every
  // Node below 24.12.
  await t.test('instrumented CJS package whose require chain reaches ESM', async () => {
    const { result, events } = await runApp('register-async.mjs', 'esm-app.mjs', 'cjs-require-esm')

    assert.deepEqual(events, ['start', 'end'], 'the CJS entry must still be instrumented')
    assert.equal(result, 'middleware:esm-require-dep-linked',
      'the value from the require(esm) chain must reach the CJS entry intact')
  })

  // Deferring CommonJS must not touch ESM, which the `load` hook still owns — there is
  // no `_compile` to fall back on for ES modules.
  await t.test('instrumented ESM package', async () => {
    const { result, events } = await runApp('register-async.mjs', 'esm-app.mjs', 'esm')

    assert.deepEqual(events, ['start', 'end'])
    assert.equal(result, 'doing stuff')
  })
})

// Pins the caveat of deferring CommonJS: the `_compile` patch is now the only thing that
// instruments it on the async path, so registering the hooks without the patch silently
// instruments nothing. The README always pairs them.
test('async hooks without the _compile patch do not instrument CJS', async () => {
  const { result, events } = await runApp('register-async-no-patch.mjs', 'esm-app.mjs', 'cjs-require-esm')

  assert.deepEqual(events, [], 'nothing can transform CommonJS without the _compile patch')
  assert.equal(result, 'middleware:esm-require-dep-linked', 'and the module itself still works')
})

// The sync hooks are the only path that transforms CommonJS in the loader itself.
test('sync hooks instrument a CJS package whose require chain reaches ESM', { skip: !stableSyncHooks }, async () => {
  const { result, events } = await runApp('register-sync.mjs', 'esm-app.mjs', 'cjs-require-esm')

  assert.deepEqual(events, ['start', 'end'])
  assert.equal(result, 'middleware:esm-require-dep-linked')
})
