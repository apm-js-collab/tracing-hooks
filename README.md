# Tracing Hooks

This repository contains a ESM loader for injecting tracing channel hooks into Node.js modules. It also has a patch for Module to be used to patch CJS modules.

## Usage

Note: the module loading hooks API in Node.js has changed as of
v26. To support all active Node.js versions with
forward-compatibility, create a combined loader as an ESM module.

This can be done for any CommonJS _or_ ES Module application, but
the loader itself must use ESM.

```js
// loader.mjs
import Module from 'node:module'

// the synchronous hooks for newer node versions
import { initialize, resolve, load } from '@apm-js-collab/tracing-hooks/hook-sync.mjs'
import ModulePatch from '@apm-js-collab/tracing-hooks'

// the instrumentations we want to apply
const instrumentations = [
  {
    channelName: 'channel1',
    module: { name: 'pkg1', verisonRange: '>=1.0.0', filePath: 'index.js' },
    functionQuery: {
      className: 'Class1',
      methodName: 'method1',
      kind: 'Async'
    }
  },
  {
    channelName: 'channel2',
    module: { name: 'pkg2', verisonRange: '>=1.0.0', filePath: 'index.js' },
    functionQuery: {
      className: 'Class2,
      methodName: 'method2',
      kind: 'Sync'
    }
  }
]

// detection to decide module loader hooks to use
// registerHooks was present but not stable until 24.13 and 25.1
const version = (process.versions.node ?? '0.0.0')
  .split('.')
  .map(n => parseInt(n, 10))
const stableSyncHooks = version[0] > 25 ||
  version[0] === 25 && version[1] >= 1 ||
  version[0] === 24 && version[1] >= 13

if (typeof Module.registerHooks === 'function' && stableSyncHooks) {
  initialize({ instrumentations })
  Module.registerHooks({ resolve, load })
} else if (typeof Module.register === 'function') {
  Module.register('@apm-js-collab/tracing-hooks/hook.mjs', import.meta.url, {
    data: { instrumentations }
  });

  // ALSO patch `Module.prototype._compile` for the CJS side: when
  // an ESM file `import`s a CJS package, Node loads the package's
  // entry through the ESM bridge but resolves the package's
  // INTERNAL `require()` calls through the CJS machinery.
  // Those internal requires never reach the ESM resolve hook, so
  // without this patch the file we actually want to instrument is
  // loaded untransformed.
  // This isn't necessary in the registerHooks case, because Node
  // applies those hooks to all CJS and ESM modules.
  new ModulePatch({ instrumentations }).patch();
} else {
  throw new Error('No available API to apply module load hooks')
}
```

To run your application with these instrumentations applied, pass
it to the `--import` argument:

```
node --import=loader.mjs ./my-app.js
```

## Debugging

The [debug module](https://www.npmjs.com/package/debug) is used to provide
insight into the patching process. Set `DEBUG='@apm-js-collab*'` to view these
logs.

Additionally, any patched files can be written out by enabling dump mode. This
is done by setting the environment variable `TRACING_DUMP` to any value. By
default, it will write out file to the system's temporary directory as the
parent directory. The target parent directory can be configured by setting
the `TRACING_DUMP_DIR` environment variable to an absolute path. In either
case, the resolved filename of the module being patched is appended. For
example, if we are patching `lib/index.js` in the `foo` package, and we set
a base directory of `/tmp/dump/`, then the patched code will be written to
`/tmp/dump/foo/lib/index.js`.

### Diagnostics Hook

A diagnostics hook can be set which is called every time a module is transformed 
or transformation fails. This hook will only work with the synchronous 
`registerHooks` because the older `register` runs in a different thread.

```js
import { setDiagnosticsHook } from '@apm-js-collab/tracing-hooks/hook-sync.mjs'

setDiagnosticsHook(({ url, moduleName, error }) => {
  if(error) {
    // injection failed
  } else {
    // injection succeeded
  }
})
```