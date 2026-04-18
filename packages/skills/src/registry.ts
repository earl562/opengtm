import { createSkill } from '@opengtm/core'
import { OPEN_GTM_SKILL_DISCLOSURE_LEVELS } from './manifest.js'
import type { OpenGtmSkill, OpenGtmSkillInput } from '@opengtm/types'

export function createSkillRegistry(skills: OpenGtmSkill[] = []) {
  const registry = new Map(skills.map((skill) => [skill.id, skill]))

  return {
    add(skill: OpenGtmSkill) {
      registry.set(skill.id, skill)
      return skill
    },
    get(id: string) {
      return registry.get(id) || null
    },
    search(query: string) {
      const lower = query.toLowerCase()
      return [...registry.values()].filter((skill) => {
        return `${skill.name}`.toLowerCase().includes(lower)
      })
    },
    values() {
      return [...registry.values()]
    }
  }
}

export function getSkillDisclosure(skill: OpenGtmSkill, level = 'summary' as const) {
  if (!(OPEN_GTM_SKILL_DISCLOSURE_LEVELS as readonly string[]).includes(level)) {
    throw new Error(`Unknown OpenGTM skill disclosure level: ${level}`)
  }

  return level
}

export function bindSkill(skill: OpenGtmSkill, _connectorContracts: { provider: string }[] = []) {
  return {
    skillId: skill.id,
    bindings: []
  }
}

export function composeSkills({
  name,
  summary,
  skills
}: {
  name: string
  summary: string
  skills: OpenGtmSkill[]
}): OpenGtmSkill {
  return createSkill({
    name,
    version: '1.0.0',
    disclosure: 'full',
    description: `Composite skill built from ${skills.map((s) => s.name).join(', ')}`,
    requirements: []
  })
}