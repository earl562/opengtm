import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  dts: true,
  splitting: false,
  bundle: true,
  // Bundle internal workspaces so the CLI can run without TS-at-runtime.
  noExternal: [/^@opengtm\//],
  // Ensure node:sqlite stays node:sqlite (esbuild may drop the node: prefix).
  esbuildPlugins: [
    {
      name: 'preserve-node-sqlite',
      setup(build) {
        build.onResolve({ filter: /^node:sqlite$/ }, (args) => {
          return { path: args.path, external: true }
        })
      }
    }
  ]
})
