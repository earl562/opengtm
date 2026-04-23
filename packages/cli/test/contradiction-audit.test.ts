import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

describe('contradiction audit', () => {
  it('passes the public support-tier contradiction audit', () => {
    const output = execFileSync('node', [join(repoRoot, 'scripts/contradiction-audit.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8'
    })

    expect(output).toContain('OpenGTM contradiction audit passed.')
  })
})
