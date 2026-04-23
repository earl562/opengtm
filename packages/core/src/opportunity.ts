import { createEntityBase } from './utils.js'
import type { OpenGtmOpportunity, OpenGtmOpportunityInput } from '@opengtm/types'

export function createOpportunity(input: OpenGtmOpportunityInput): OpenGtmOpportunity {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    accountId: input.accountId,
    name: input.name,
    amountCents: input.amountCents ?? null,
    stage: input.stage || 'open',
    metadata: input.metadata || {}
  }
}
