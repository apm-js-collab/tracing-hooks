export const instrumentations = [
  {
    channelName: 'use',
    module: { name: 'cjs-entry-lib', versionRange: '>=1', filePath: 'lib/application.js' },
    functionQuery: { className: 'Application', methodName: 'use', kind: 'Sync' }
  },
  {
    channelName: 'doStuff',
    module: { name: 'esm-pkg', versionRange: '>=1', filePath: 'foo.js' },
    functionQuery: { className: 'Foo', methodName: 'doStuff', kind: 'Async' }
  }
]
