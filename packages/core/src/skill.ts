import { createEntityBase } from './utils.js'
import type { OpenGtmSkill, OpenGtmSkillInput } from '@opengtm/types'

export function createSkill(input: OpenGtmSkillInput): OpenGtmSkill {
  const base = createEntityBase(input)
  return {
    ...base,
    name: input.name,
    version: input.version,
    disclosure: input.disclosure || 'full',
    description: input.description || '',
    requirements: input.requirements || []
  }
}