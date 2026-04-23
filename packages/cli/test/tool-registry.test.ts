import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { executeHarnessPrimitive } from '../src/tool-registry.js'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

describe('tool registry primitives', () => {
  it('runs list_files against a workspace path', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-tools-'))
    writeFileSync(join(cwd, 'alpha.txt'), 'hello')

    const result = await executeHarnessPrimitive({
      cwd,
      name: 'list_files',
      input: { path: '.' }
    })

    expect(result.kind).toBe('primitive.list_files')
    expect(result.entries).toContain('alpha.txt')
  })

  it('persists todo lifecycle primitives', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-todos-'))

    await executeHarnessPrimitive({
      cwd,
      name: 'write_todos',
      input: {
        todos: [{ id: 't1', content: 'ship harness', status: 'pending' }]
      }
    })

    const listed = await executeHarnessPrimitive({
      cwd,
      name: 'list_todos',
      input: {}
    })

    expect(listed.todos).toHaveLength(1)
    expect(listed.todos[0].id).toBe('t1')

    await executeHarnessPrimitive({
      cwd,
      name: 'complete_todo',
      input: { id: 't1' }
    })

    const completed = await executeHarnessPrimitive({
      cwd,
      name: 'list_todos',
      input: {}
    })

    expect(completed.todos[0].status).toBe('completed')
  })

  it('finds cross-file symbol references in the repo', async () => {
    const result = await executeHarnessPrimitive({
      cwd: repoRoot,
      name: 'find_referencing_symbols',
      input: { symbol: 'handleAuth', path: 'packages/cli/src' }
    })

    expect(result.matches.length).toBeGreaterThan(0)
    expect(result.matches.some((match: { filePath: string }) => match.filePath.endsWith('router.ts'))).toBe(true)
  })
})
