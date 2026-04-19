import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('contradiction audit', () => {
  it('passes the public support-tier contradiction audit', () => {
    const output = execFileSync('node', ['./scripts/contradiction-audit.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })

    expect(output).toContain('OpenGTM contradiction audit passed.')
  })
})
