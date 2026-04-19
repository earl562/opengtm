import type { SkillArtifact, SkillRequiredConnector } from './types.js'

export interface ConnectorDescriptor {
  family: string
  capabilities: string[]
}

export interface SkillBindingResult {
  skillId: string
  bound: boolean
  satisfied: SkillRequiredConnector[]
  missing: SkillRequiredConnector[]
}

export function bindSkillToConnectors(
  artifact: SkillArtifact,
  connectors: ConnectorDescriptor[]
): SkillBindingResult {
  const satisfied: SkillRequiredConnector[] = []
  const missing: SkillRequiredConnector[] = []

  for (const req of artifact.manifest.requiredConnectors) {
    const connector = connectors.find((c) => c.family === req.family)
    if (connector && connector.capabilities.includes(req.capability)) {
      satisfied.push(req)
    } else {
      missing.push(req)
    }
  }

  return {
    skillId: artifact.manifest.id,
    bound: missing.length === 0,
    satisfied,
    missing
  }
}

export function filterRunnableSkills(
  artifacts: SkillArtifact[],
  connectors: ConnectorDescriptor[]
): SkillArtifact[] {
  return artifacts.filter((a) => bindSkillToConnectors(a, connectors).bound)
}
