import { createSkill } from '@opengtm/core'
import type { OpenGtmSkill, OpenGtmSkillInput } from '@opengtm/types'

export const OPEN_GTM_SKILL_DISCLOSURE_LEVELS = [
  'summary',
  'details',
  'full'
] as const

export function createSkillManifest(input: OpenGtmSkillInput): OpenGtmSkill {
  return createSkill(input)
}