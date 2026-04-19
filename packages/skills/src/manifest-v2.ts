import type { SkillManifest, SkillArtifact } from './types.js'

export function validateSkillManifest(m: SkillManifest): string[] {
  const errors: string[] = []
  if (!m.id || !/^[a-z][a-z0-9_]*$/.test(m.id)) {
    errors.push('id must be lowercase snake_case')
  }
  if (!m.name) errors.push('name is required')
  if (!m.version || !/^\d+\.\d+\.\d+$/.test(m.version)) {
    errors.push('version must be semver MAJOR.MINOR.PATCH')
  }
  if (!['SDR', 'AE', 'CS', 'DE', 'cross'].includes(m.persona)) {
    errors.push(`persona must be one of SDR|AE|CS|DE|cross (got ${m.persona})`)
  }
  if (!m.summary || m.summary.length < 10) {
    errors.push('summary must be at least 10 characters')
  }
  if (!Array.isArray(m.steps) || m.steps.length === 0) {
    errors.push('steps must be non-empty')
  } else {
    const ids = new Set<string>()
    for (const step of m.steps) {
      if (!step.id) errors.push('each step requires an id')
      if (ids.has(step.id)) errors.push(`duplicate step id: ${step.id}`)
      ids.add(step.id)
    }
  }
  return errors
}

export function makeSkillArtifact(manifest: SkillManifest, contentPath?: string): SkillArtifact {
  const errors = validateSkillManifest(manifest)
  if (errors.length > 0) {
    throw new Error(
      `Invalid skill manifest "${manifest.id || '<unknown>'}": ${errors.join('; ')}`
    )
  }
  return { manifest, contentPath }
}
