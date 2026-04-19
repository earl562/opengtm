import type { OpenGtmConnectorContract, OpenGtmConnectorSession } from '@opengtm/types'
import { findConnectorContract } from './bundle.js'

export interface ConnectorValidationResult {
  status: string
  authState: string
  validatedScopes: string[]
  capabilityStatus: Record<string, string>
}

export function validateConnectorSession(
  session: OpenGtmConnectorSession | null,
  contract: OpenGtmConnectorContract,
  { now = new Date() }: { now?: Date } = {}
): ConnectorValidationResult {
  if (!contract.secretShape.length) {
    return {
      status: 'ready',
      authState: 'not-required',
      validatedScopes: [],
      capabilityStatus: {}
    }
  }

  if (!session) {
    return {
      status: 'missing-auth',
      authState: 'missing-auth',
      validatedScopes: [],
      capabilityStatus: {}
    }
  }

  if (session.expiresAt && new Date(session.expiresAt).getTime() <= now.getTime()) {
    return {
      status: 'expired',
      authState: 'expired',
      validatedScopes: session.validatedScopes || [],
      capabilityStatus: session.capabilityStatus || {}
    }
  }

  if (session.status === 'error') {
    return {
      status: 'error',
      authState: 'provider-error',
      validatedScopes: session.validatedScopes || [],
      capabilityStatus: session.capabilityStatus || {}
    }
  }

  if (!session.secretRef) {
    return {
      status: 'missing-auth',
      authState: 'missing-auth',
      validatedScopes: [],
      capabilityStatus: session.capabilityStatus || {}
    }
  }

  return {
    status: 'ready',
    authState: 'validated',
    validatedScopes: session.validatedScopes || session.scopes || [],
    capabilityStatus: session.capabilityStatus || {}
  }
}

export function getConnectorSessionHealth(
  bundle: OpenGtmConnectorContract[],
  session: OpenGtmConnectorSession
) {
  const contract = findConnectorContract(bundle, { provider: session.provider, family: session.family })
  if (!contract) {
    return {
      provider: session.provider,
      family: session.family,
      status: 'error',
      authState: 'missing-contract',
      capabilityStatus: session.capabilityStatus || {}
    }
  }

  return {
    provider: session.provider,
    family: session.family,
    ...validateConnectorSession(session, contract)
  }
}
