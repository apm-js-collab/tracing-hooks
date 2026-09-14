// One package per rule the loader hooks use to pick an injection style, when
// the host labels the module with no `format`. Deno's synchronous hooks label
// nothing at all, for ESM and CommonJS alike. Every package exports the same
// `Foo` class, so the app and the unit test can treat them alike.
//
// `type` is what the hooks must infer. `loadable: false` marks a package no
// runtime will import, so `app.mjs` leaves it out.
export const modules = [
  {
    name: 'cjs-ext', filePath: 'index.cjs', type: 'cjs',
    why: 'the .cjs extension'
  },
  {
    name: 'cjs-type', filePath: 'index.js', type: 'cjs',
    why: 'package.json "type": "commonjs"'
  },
  {
    name: 'detect-cjs', filePath: 'index.js', type: 'cjs',
    why: 'no top level import or export in the source'
  },
  {
    name: 'esm-type', filePath: 'index.js', type: 'esm',
    why: 'package.json "type": "module"'
  },
  {
    name: 'mjs-ext', filePath: 'index.mjs', type: 'esm',
    why: 'the .mjs extension'
  },
  {
    name: 'nested-esm', filePath: 'dist/index.js', type: 'esm',
    why: 'dist/package.json, not the package root'
  },
  // The TypeScript pair. Their packages declare the opposite `"type"` on
  // purpose, the way a dual format package does, so only the extension gets
  // them right. Neither runtime strips types under node_modules, so the app
  // cannot import them; they carry no type annotations either, because the
  // code transformer parses JavaScript only.
  {
    name: 'cts-ext', filePath: 'index.cts', type: 'cjs', loadable: false,
    why: 'the .cts extension, over the package "type": "module"'
  },
  {
    name: 'mts-ext', filePath: 'index.mts', type: 'esm', loadable: false,
    why: 'the .mts extension, over the package "type": "commonjs"'
  }
]

export const instrumentations = modules.map(({ name, filePath }) => ({
  channelName: 'doStuff',
  module: { name, versionRange: '>=1', filePath },
  functionQuery: { className: 'Foo', methodName: 'doStuff', kind: 'Sync' }
}))

// What `app.mjs` imports: everything a runtime will actually load.
export const names = modules.filter(m => m.loadable !== false).map(m => m.name)
