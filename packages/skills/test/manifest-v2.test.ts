import { describe, expect, it } from 'vitest'
import { makeSkillArtifact, validateSkillManifest } from '../src/manifest-v2.js'
import type { SkillManifest } from '../src/types.js'

function makeManifest(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return {
    id: 'lead_research',
    name: 'Lead Research',
    version: '1.0.0',
    persona: 'SDR',
    summary: 'Gather lead context before outreach.',
    triggers: [{ type: 'intent', match: 'research this lead' }],
    preconditions: ['crm record exists'],
    steps: [{ id: 'load', description: 'Load lead record' }],
    antiPatterns: ['do not send outreach'],
    validations: ['record exists'],
    requiredConnectors: [{ family: 'crm', capability: 'lead.read' }],
    tags: ['research'],
    composition: 'serial',
    ...overrides
  }
}

describe('skills: manifest-v2', () => {
  it('validates a well-formed manifest', () => {
    expect(validateSkillManifest(makeManifest())).toEqual([])
  })

  it('reports structural validation errors', () => {
    const errors = validateSkillManifest(
      makeManifest({
        id: 'BadId',
        version: '1.0',
        persona: 'ops' as SkillManifest['persona'],
        summary: 'too short',
        steps: [
          { id: 'dup', description: 'first' },
          { id: 'dup', description: 'second' },
          { id: '', description: 'third' }
        ]
      })
    )

    expect(errors).toEqual([
      'id must be lowercase snake_case',
      'version must be semver MAJOR.MINOR.PATCH',
      'persona must be one of SDR|AE|CS|DE|cross (got ops)',
      'summary must be at least 10 characters',
      'duplicate step id: dup',
      'each step requires an id'
    ])
  })

  it('creates an artifact with optional content path', () => {
    const manifest = makeManifest()
    expect(makeSkillArtifact(manifest, '/tmp/skill.md')).toEqual({
      manifest,
      contentPath: '/tmp/skill.md'
    })
  })

  it('throws when building an artifact from an invalid manifest', () => {
    expect(() => makeSkillArtifact(makeManifest({ steps: [] }))).toThrow(
      'Invalid skill manifest "lead_research": steps must be non-empty'
    )
  })
})
