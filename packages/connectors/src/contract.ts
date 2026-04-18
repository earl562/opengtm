import { createConnectorContract, createConnectorSession, createConnectorExecutionError } from '@opengtm/core'
import type { OpenGtmConnectorContract, OpenGtmConnectorSession, OpenGtmConnectorExecutionError, OpenGtmConnectorSessionInput, OpenGtmConnectorContractInput } from '@opengtm/types'

export interface ConnectorSessionDescriptorInput {
  provider: string
  workspaceId: string
  scopes?: string[]
  authMode?: string
}

export function createConnectorSessionDescriptor({
  provider,
  workspaceId,
  scopes = [],
  authMode = 'oauth'
}: ConnectorSessionDescriptorInput) {
  return {
    provider,
    workspaceId,
    scopes,
    authMode
  }
}

export function createProviderSession(input: {
  id?: string
  workspaceId: string
  provider: string
  family: string
  authMode?: string
  secretRef?: string | null
  scopes?: string[]
  expiresAt?: string | Date | null
  refreshAt?: string | Date | null
  providerAccountRef?: string | null
}): OpenGtmConnectorSession {
  const ready = Boolean(input.secretRef)
  return createConnectorSession({
    id: input.id,
    workspaceId: input.workspaceId,
    provider: input.provider,
    family: input.family,
    authMode: input.authMode || 'oauth',
    status: ready ? 'ready' : 'missing-auth',
    scopes: input.scopes || [],
    expiresAt: input.expiresAt || null,
    refreshAt: input.refreshAt || null,
    secretRef: input.secretRef || null,
    providerAccountRef: input.providerAccountRef || null,
    capabilityStatus: Object.fromEntries((input.scopes || []).map((scope) => [scope, ready ? 'ready' : 'missing-auth'])),
    validatedScopes: ready ? input.scopes || [] : [],
    lastValidatedAt: new Date().toISOString()
  })
}