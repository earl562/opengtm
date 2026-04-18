import { createEntityBase } from './utils.js'
import type { OpenGtmAccount, OpenGtmAccountInput, OpenGtmContact, OpenGtmContactInput } from '@opengtm/types'

export function createAccount(input: OpenGtmAccountInput): OpenGtmAccount {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    name: input.name,
    domain: input.domain,
    tier: input.tier || 'standard',
    metadata: input.metadata || {}
  }
}

export function createContact(input: OpenGtmContactInput): OpenGtmContact {
  const base = createEntityBase(input)
  return {
    ...base,
    accountId: input.accountId,
    name: input.name,
    email: input.email,
    role: input.role || 'unknown',
    metadata: input.metadata || {}
  }
}