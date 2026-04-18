import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    workspaces: ['packages/*/test', 'test'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
    },
    globals: true,
    environment: 'node',
    hookTimeout: 30000,
    testTimeout: 30000,
  },
})