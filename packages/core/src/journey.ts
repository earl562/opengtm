import { createEntityBase } from './utils.js'
import type { OpenGtmJourney, OpenGtmJourneyInput } from '@opengtm/types'

export function createJourney(input: OpenGtmJourneyInput): OpenGtmJourney {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    initiativeId: input.initiativeId,
    name: input.name,
    description: input.description || '',
    workItemIds: input.workItemIds || []
  }
}