import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderGtmAssetBackground } from '../src/startup-background.js'

describe('startup background renderer', () => {
  it('renders fallback texture when the GTM cover asset is unavailable', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-startup-fallback-'))
    const lines = renderGtmAssetBackground({
      cwd,
      width: 64,
      height: 10
    })

    expect(lines).toHaveLength(10)
    expect(lines[0]).toContain('\x1b[38;2;')
    expect(lines[0]).toContain('\x1b[0m')
  })

  it('renders ANSI truecolor output from the GTM cover asset when present', () => {
    const repoRoot = join(process.cwd(), '..', '..')
    const lines = renderGtmAssetBackground({
      cwd: repoRoot,
      width: 72,
      height: 12
    })

    expect(lines).toHaveLength(12)
    expect(lines[0]).toContain('\x1b[38;2;')
    expect(lines[0]).toContain('\x1b[48;2;')
    expect(lines[0]).toContain('\x1b[0m')
  })
})
