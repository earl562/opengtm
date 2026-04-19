import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createSkillRegistryV2,
  discloseManifest,
  loadGtmSkillArtifacts,
  makeSkillArtifact,
  scoreMatch
} from '../src/index.js'
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
    steps: [
      { id: 'load', description: 'Load lead record' },
      { id: 'brief', description: 'Write the brief' }
    ],
    antiPatterns: ['do not send outreach'],
    validations: ['record exists'],
    requiredConnectors: [{ family: 'crm', capability: 'lead.read' }],
    tags: ['research', 'inbound'],
    composition: 'serial',
    ...overrides
  }
}

describe('skills: registry-v2', () => {
  it('supports add/get/list/disclose/match flows', () => {
    const seed = makeSkillArtifact(makeManifest())
    const registry = createSkillRegistryV2([seed])
    const added = makeSkillArtifact(
      makeManifest({
        id: 'cross_fit',
        name: 'Cross Fit',
        persona: 'cross',
        summary: 'Align product fit with buyer needs.',
        triggers: [{ type: 'intent', match: 'check product fit' }],
        tags: ['fit', 'research'],
        requiredConnectors: [{ family: 'docs', capability: 'search' }]
      })
    )

    registry.add(added)

    expect(registry.get('lead_research')).toEqual(seed)
    expect(registry.get('missing')).toBeNull()
    expect(registry.list().map((artifact) => artifact.manifest.id)).toEqual([
      'lead_research',
      'cross_fit'
    ])
    expect(registry.disclose('lead_research', 'summary')).toContain('# Lead Research v1.0.0')

    const matches = registry.match({
      intent: 'research this lead',
      persona: 'SDR',
      requiredCapabilities: ['lead.read'],
      tags: ['research'],
      limit: 1
    })

    expect(matches).toHaveLength(1)
    expect(matches[0]?.skillId).toBe('lead_research')
    expect(matches[0]?.score).toBeGreaterThan(0)
  })

  it('discloses summary, details, and full content progressively', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'opengtm-skills-'))
    const contentPath = join(tempDir, 'skill.md')
    writeFileSync(contentPath, '## runbook\nUse sources only.', 'utf8')

    const artifact = makeSkillArtifact(makeManifest({ exemplars: ['cite evidence'] }), contentPath)

    expect(discloseManifest(artifact, 'summary')).toBe([
      '# Lead Research v1.0.0',
      'persona: SDR',
      '',
      'Gather lead context before outreach.'
    ].join('\n'))

    const details = discloseManifest(artifact, 'details')
    expect(details).toContain('## triggers')
    expect(details).toContain('## required_connectors')
    expect(details).not.toContain('## steps')

    const full = discloseManifest(artifact, 'full')
    expect(full).toContain('## steps')
    expect(full).toContain('## exemplars')
    expect(full).toContain('## content')
    expect(full).toContain('Use sources only.')
  })

  it('returns null when content loading fails', () => {
    const artifact = makeSkillArtifact(makeManifest(), '/missing/skill.md')
    const full = discloseManifest(artifact, 'full')
    expect(full).not.toContain('## content')
  })

  it('loads real GTM content into full disclosure', () => {
    const registry = createSkillRegistryV2(loadGtmSkillArtifacts())
    const disclosure = registry.disclose('lead_research', 'full')

    expect(disclosure).not.toBeNull()
    expect(disclosure).toContain('## content')
    expect(disclosure).toContain('Use only evidence you can cite to a source.')
  })

  it('scores matches from persona, intent, tags, and capabilities', () => {
    const manifest = makeManifest({
      tags: ['research', 'outbound'],
      triggers: [{ type: 'intent', match: 'research this lead' }],
      requiredConnectors: [
        { family: 'crm', capability: 'lead.read' },
        { family: 'web_research', capability: 'search' }
      ]
    })

    const score = scoreMatch(manifest, {
      intent: 'research this lead',
      persona: 'SDR',
      tags: ['research'],
      requiredCapabilities: ['crm.lead.read', 'search']
    })

    expect(score.skillId).toBe('lead_research')
    expect(score.score).toBe(20)
    expect(score.reasons).toEqual([
      'persona exact match: SDR',
      'intent term hit: "research"',
      'intent term hit: "lead"',
      'trigger match: intent:research this lead',
      'tag: research',
      'capability: crm.lead.read',
      'capability: search'
    ])
  })

  it('gives cross-persona skills a weaker persona bonus', () => {
    const manifest = makeManifest({
      id: 'icp_scoring',
      persona: 'cross',
      summary: 'Score leads against ICP rules consistently.'
    })

    expect(scoreMatch(manifest, { persona: 'AE' })).toEqual({
      skillId: 'icp_scoring',
      score: 2,
      reasons: ['cross-persona skill']
    })
  })
})
