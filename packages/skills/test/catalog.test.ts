import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadGtmSkillArtifacts, validateSkillManifest } from '../src/index.js'

describe('skills: catalog', () => {
  it('loads the 18-skill GTM catalog with valid manifests', () => {
    const artifacts = loadGtmSkillArtifacts()
    const contentPaths = artifacts.map((artifact) => artifact.contentPath)

    expect(artifacts).toHaveLength(18)
    expect(new Set(artifacts.map((artifact) => artifact.manifest.id)).size).toBe(18)
    expect(contentPaths.every((contentPath) => typeof contentPath === 'string')).toBe(true)
    expect(contentPaths.every((contentPath) => (contentPath ? existsSync(contentPath) : false))).toBe(true)
    expect(artifacts.map((artifact) => validateSkillManifest(artifact.manifest))).toEqual(
      Array.from({ length: 18 }, () => [])
    )
  })

  it('maps every catalog skill to the conventional markdown content directory', () => {
    const artifacts = loadGtmSkillArtifacts()

    expect(
      artifacts.every(
        (artifact) =>
          artifact.contentPath?.endsWith(`/packages/skills/content/${artifact.manifest.id}.md`) ?? false
      )
    ).toBe(true)
  })

  it('preserves basic catalog sanity across personas and connectors', () => {
    const manifests = loadGtmSkillArtifacts().map((artifact) => artifact.manifest)

    expect(new Set(manifests.map((manifest) => manifest.persona))).toEqual(
      new Set(['SDR', 'AE', 'CS', 'DE', 'cross'])
    )
    expect(manifests.every((manifest) => manifest.requiredConnectors.length > 0)).toBe(true)
    expect(manifests.every((manifest) => manifest.steps.length > 0)).toBe(true)
  })
})
