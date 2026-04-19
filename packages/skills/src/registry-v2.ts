import { readFileSync } from 'node:fs'
import type { SkillArtifact, SkillDisclosure, SkillManifest, SkillMatchScore } from './types.js'

export interface SkillRegistry {
  add(artifact: SkillArtifact): void
  get(id: string): SkillArtifact | null
  list(): SkillArtifact[]
  disclose(id: string, level: SkillDisclosure): string | null
  match(query: SkillMatchQuery): SkillMatchScore[]
}

export interface SkillMatchQuery {
  intent?: string
  persona?: string
  requiredCapabilities?: string[]
  tags?: string[]
  limit?: number
}

export interface SkillRegistryOptions {
  contentLoader?: (path: string) => string | null
}

export function createSkillRegistryV2(
  seed: SkillArtifact[] = [],
  opts: SkillRegistryOptions = {}
): SkillRegistry {
  const byId = new Map<string, SkillArtifact>()
  for (const a of seed) byId.set(a.manifest.id, a)

  const loader = opts.contentLoader ?? defaultContentLoader

  return {
    add(artifact) {
      byId.set(artifact.manifest.id, artifact)
    },
    get(id) {
      return byId.get(id) ?? null
    },
    list() {
      return Array.from(byId.values())
    },
    disclose(id, level) {
      const a = byId.get(id)
      if (!a) return null
      return discloseManifest(a, level, loader)
    },
    match(query) {
      const scores: SkillMatchScore[] = []
      for (const artifact of byId.values()) {
        const score = scoreMatch(artifact.manifest, query)
        if (score.score > 0) scores.push(score)
      }
      scores.sort((a, b) => b.score - a.score)
      return scores.slice(0, query.limit ?? 10)
    }
  }
}

export function discloseManifest(
  artifact: SkillArtifact,
  level: SkillDisclosure,
  loader: (path: string) => string | null = defaultContentLoader
): string {
  const m = artifact.manifest
  const summaryBlock = `# ${m.name} v${m.version}\npersona: ${m.persona}\n\n${m.summary}`

  if (level === 'summary') {
    return summaryBlock
  }

  if (level === 'details') {
    const triggers = m.triggers
      .map((t) => `  - ${t.type}: ${t.match}`)
      .join('\n')
    const preconditions = m.preconditions.map((p) => `  - ${p}`).join('\n')
    const connectors = m.requiredConnectors
      .map((c) => `  - ${c.family}.${c.capability}`)
      .join('\n')
    const tags = m.tags.join(', ')

    return [
      summaryBlock,
      '',
      '## triggers',
      triggers || '  (none)',
      '',
      '## preconditions',
      preconditions || '  (none)',
      '',
      '## required_connectors',
      connectors || '  (none)',
      '',
      `tags: ${tags || '(none)'}`,
      `composition: ${m.composition}`
    ].join('\n')
  }

  const details = discloseManifest(artifact, 'details', loader)
  const steps = m.steps
    .map((s, i) => `  ${i + 1}. [${s.id}] ${s.description}`)
    .join('\n')
  const antiPatterns = m.antiPatterns.map((a) => `  - ${a}`).join('\n')
  const validations = m.validations.map((v) => `  - ${v}`).join('\n')
  const exemplars = (m.exemplars ?? []).map((e) => `  - ${e}`).join('\n')
  const content = artifact.contentPath ? loader(artifact.contentPath) : null

  return [
    details,
    '',
    '## steps',
    steps || '  (none)',
    '',
    '## anti_patterns',
    antiPatterns || '  (none)',
    '',
    '## validations',
    validations || '  (none)',
    '',
    '## exemplars',
    exemplars || '  (none)',
    ...(content ? ['', '## content', content] : [])
  ].join('\n')
}

export function scoreMatch(manifest: SkillManifest, query: SkillMatchQuery): SkillMatchScore {
  let score = 0
  const reasons: string[] = []

  if (query.persona) {
    if (manifest.persona === query.persona) {
      score += 5
      reasons.push(`persona exact match: ${query.persona}`)
    } else if (manifest.persona === 'cross') {
      score += 2
      reasons.push('cross-persona skill')
    }
  }

  if (query.intent) {
    const intent = query.intent.toLowerCase()
    const haystack = `${manifest.name} ${manifest.summary} ${manifest.tags.join(' ')}`.toLowerCase()
    const tokens = intent.split(/\s+/).filter((t) => t.length >= 3)
    for (const token of tokens) {
      if (haystack.includes(token)) {
        score += 2
        reasons.push(`intent term hit: "${token}"`)
      }
    }
    for (const trigger of manifest.triggers) {
      if (trigger.match.toLowerCase().includes(intent)) {
        score += 4
        reasons.push(`trigger match: ${trigger.type}:${trigger.match}`)
      }
    }
  }

  if (query.tags) {
    for (const tag of query.tags) {
      if (manifest.tags.includes(tag)) {
        score += 3
        reasons.push(`tag: ${tag}`)
      }
    }
  }

  if (query.requiredCapabilities) {
    for (const cap of query.requiredCapabilities) {
      const hit = manifest.requiredConnectors.find(
        (c) => `${c.family}.${c.capability}` === cap || c.capability === cap
      )
      if (hit) {
        score += 2
        reasons.push(`capability: ${cap}`)
      }
    }
  }

  return { skillId: manifest.id, score, reasons }
}

function defaultContentLoader(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}
