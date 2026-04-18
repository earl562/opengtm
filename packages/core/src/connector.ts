import { createEntityBase, toIso } from './utils.js'
import type { OpenGtmConnectorContract, OpenGtmConnectorContractInput, OpenGtmConnectorSession, OpenGtmConnectorSessionInput, OpenGtmConnectorExecutionError, OpenGtmConnectorExecutionErrorInput } from '@opengtm/types'
import { OPEN_GTM_CONNECTOR_FAMILIES, type OpenGtmConnectorFamily, OPEN_GTM_CONNECTOR_SESSION_STATUSES, type OpenGtmConnectorSessionStatus } from '@opengtm/types'

export function createConnectorContract(input: OpenGtmConnectorContractInput): OpenGtmConnectorContract {
  return {
    family: input.family as OpenGtmConnectorFamily,
    provider: input.provider,
    capabilities: input.capabilities || [],
    readActions: input.readActions || [],
    writeActions: input.writeActions || [],
    defaultApprovalMode: input.defaultApprovalMode || 'auto',
    traceRequired: input.traceRequired ?? true,
    secretShape: input.secretShape || []
  }
}

export function createConnectorSession(input: OpenGtmConnectorSessionInput): OpenGtmConnectorSession {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    provider: input.provider,
    family: input.family as OpenGtmConnectorFamily,
    authMode: input.authMode || 'oauth',
    status: (input.status as OpenGtmConnectorSessionStatus) || 'missing-auth',
    scopes: input.scopes || [],
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    refreshAt: input.refreshAt ? new Date(input.refreshAt).toISOString() : null,
    secretRef: input.secretRef || null,
    providerAccountRef: input.providerAccountRef || null,
    lastError: input.lastError || null,
    capabilityStatus: input.capabilityStatus || {},
    validatedScopes: input.validatedScopes || [],
    lastValidatedAt: input.lastValidatedAt ? new Date(input.lastValidatedAt).toISOString() : null
  }
}

export function createConnectorExecutionError(input: OpenGtmConnectorExecutionErrorInput): OpenGtmConnectorExecutionError {
  return {
    id: input.id || `${input.provider}-${Date.now()}`,
    provider: input.provider,
    family: input.family as OpenGtmConnectorFamily,
    action: input.action as never,
    retryable: input.retryable ?? true,
    authState: input.authState || 'valid',
    classification: input.classification || 'unknown',
    message: input.message,
    createdAt: toIso(input.createdAt)
  }
}