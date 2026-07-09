'use strict'
import test from 'node:test'
import assert from 'node:assert'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const appDir = path.join(import.meta.dirname, 'example-deps/lib')

const [major, minor] = process.versions.node.split('.').map(n => parseInt(n, 10))
// Node < 24.12 crashes when a CommonJS module is evaluated on the require(esm) bridge
// and its top-level require chain reaches ESM (nodejs/node#59666, fixed by
// nodejs/node#60380 and not backported to 22.x).
const safeRequireEsm = major > 24 || (major === 24 && minor >= 12)
// `Module.registerHooks` exists earlier but only became stable in 24.13 / 25.1.
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

test('async hooks + transformCjs:false', async (t) => {
  // The regression. With `transformCjs` left at its default, this app exits non-zero
  // with ERR_VM_MODULE_LINK_FAILURE on Node < 24.12 — see the last test in this file.
  await t.test('instrumented CJS package whose require chain reaches ESM', async () => {
    const { result, events } = await runApp('register-async.mjs', 'esm-app.mjs', 'cjs-require-esm')

    assert.deepEqual(events, ['start', 'end'], 'the CJS entry must still be instrumented')
    assert.equal(result, 'middleware:esm-require-dep-linked',
      'the value from the require(esm) chain must reach the CJS entry intact')
  })

  await t.test('instrumented CJS package with no ESM dependencies', async () => {
    const { result, events } = await runApp('register-async.mjs', 'esm-app.mjs', 'cjs-plain')

    assert.deepEqual(events, ['start', 'end'])
    assert.equal(result, 'hello world')
  })

  // Opting out of CommonJS must not touch ESM, which the `load` hook still owns.
  await t.test('instrumented ESM package', async () => {
    const { result, events } = await runApp('register-async.mjs', 'esm-app.mjs', 'esm')

    assert.deepEqual(events, ['start', 'end'])
    assert.equal(result, 'doing stuff')
  })

  await t.test('CJS app requiring an instrumented CJS package', async () => {
    const { result, events } = await runApp('register-async.mjs', 'cjs-app.cjs')

    assert.deepEqual(events, ['start', 'end'])
    assert.equal(result, 'hello world')
  })
})

// No `_compile` patch here: whatever gets instrumented is instrumented by the hook.
test('async hooks with the default transformCjs', async (t) => {
  await t.test('instrumented CJS package with no ESM dependencies', async () => {
    const { result, events } = await runApp('register-async-cjs.mjs', 'esm-app.mjs', 'cjs-plain')

    assert.deepEqual(events, ['start', 'end'])
    assert.equal(result, 'hello world')
  })

  await t.test('instrumented ESM package', async () => {
    const { result, events } = await runApp('register-async-cjs.mjs', 'esm-app.mjs', 'esm')

    assert.deepEqual(events, ['start', 'end'])
    assert.equal(result, 'doing stuff')
  })

  await t.test('CJS package whose require chain reaches ESM', { skip: !safeRequireEsm }, async () => {
    const { result, events } = await runApp('register-async-cjs.mjs', 'esm-app.mjs', 'cjs-require-esm')

    assert.deepEqual(events, ['start', 'end'])
    assert.equal(result, 'middleware:esm-require-dep-linked')
  })

  // Pins the reason `transformCjs: false` exists. If this ever stops throwing on a
  // version below 24.12, the Node fix was backported and the opt-out can be relaxed.
  await t.test('CJS package whose require chain reaches ESM crashes below Node 24.12', { skip: safeRequireEsm }, async () => {
    await assert.rejects(
      () => runApp('register-async-cjs.mjs', 'esm-app.mjs', 'cjs-require-esm'),
      (err) => {
        assert.match(err.stderr, /ERR_VM_MODULE_LINK_FAILURE/)
        return true
      })
  })
})

// The sync hooks transform CommonJS themselves and ignore `transformCjs`.
test('sync hooks instrument a CJS package whose require chain reaches ESM', { skip: !stableSyncHooks }, async () => {
  const { result, events } = await runApp('register-sync.mjs', 'esm-app.mjs', 'cjs-require-esm')

  assert.deepEqual(events, ['start', 'end'])
  assert.equal(result, 'middleware:esm-require-dep-linked')
})
