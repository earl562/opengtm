export type SkillDisclosure = 'summary' | 'details' | 'full'

export type SkillPersona = 'SDR' | 'AE' | 'CS' | 'DE' | 'cross'

export type SkillComposition = 'atomic' | 'serial' | 'parallel' | 'conditional'

export interface SkillTrigger {
  type: 'event' | 'intent' | 'schedule'
  match: string
}

export interface SkillStep {
  id: string
  description: string
  action?: string
  inputs?: string[]
  outputs?: string[]
}

export interface SkillRequiredConnector {
  family: string
  capability: string
}

export interface SkillManifest {
  id: string
  name: string
  version: string
  persona: SkillPersona
  summary: string
  triggers: SkillTrigger[]
  preconditions: string[]
  steps: SkillStep[]
  antiPatterns: string[]
  validations: string[]
  requiredConnectors: SkillRequiredConnector[]
  tags: string[]
  composition: SkillComposition
  exemplars?: string[]
}

export interface SkillArtifact {
  manifest: SkillManifest
  contentPath?: string
}

export interface SkillMatchScore {
  skillId: string
  score: number
  reasons: string[]
}
