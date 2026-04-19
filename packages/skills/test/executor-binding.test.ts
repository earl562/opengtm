import { describe, expect, it } from 'vitest'
import { bindSkillToConnectors, filterRunnableSkills, makeSkillArtifact } from '../src/index.js'
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

describe('skills: executor binding', () => {
  it('binds required connectors and reports missing ones', () => {
    const artifact = makeSkillArtifact(
      makeManifest({
        requiredConnectors: [
          { family: 'crm', capability: 'lead.read' },
          { family: 'web_research', capability: 'search' }
        ]
      })
    )

    expect(
      bindSkillToConnectors(artifact, [{ family: 'crm', capabilities: ['lead.read', 'account.read'] }])
    ).toEqual({
      skillId: 'lead_research',
      bound: false,
      satisfied: [{ family: 'crm', capability: 'lead.read' }],
      missing: [{ family: 'web_research', capability: 'search' }]
    })
  })

  it('filters runnable skills to fully satisfied artifacts only', () => {
    const runnable = makeSkillArtifact(makeManifest())
    const blocked = makeSkillArtifact(
      makeManifest({
        id: 'account_brief',
        name: 'Account Brief',
        persona: 'AE',
        summary: 'Build a weekly account brief with CRM and warehouse data.',
        requiredConnectors: [
          { family: 'crm', capability: 'account.read' },
          { family: 'warehouse', capability: 'query' }
        ]
      })
    )

    expect(
      filterRunnableSkills([runnable, blocked], [{ family: 'crm', capabilities: ['lead.read'] }]).map(
        (artifact) => artifact.manifest.id
      )
    ).toEqual(['lead_research'])
  })
})
