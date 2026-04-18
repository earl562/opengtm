import type { OpenGtmConnectorContract, OpenGtmConnectorSession, OpenGtmActionType, OpenGtmConnectorFamily } from '@opengtm/types'
import { createConnectorExecutionError } from '@opengtm/core'
import { findConnectorContract } from './bundle.js'
import { validateConnectorSession } from './validation.js'
import { mapHarnessActionToConnectorAction, inferConnectorMode } from './actions.js'
import { buildNormalizedData } from './data.js'

export interface ConnectorActionInput {
  provider?: string | null
  family: string
  action: string
  target: string
  payload?: Record<string, unknown>
  session?: OpenGtmConnectorSession | null
}

export function executeConnectorAction(bundle: OpenGtmConnectorContract[], {
  provider = null,
  family,
  action,
  target,
  payload = {},
  session = null
}: ConnectorActionInput) {
  const contract = provider
    ? findConnectorContract(bundle, { provider, family })
    : bundle.find((item) => item.family === family)

  if (!contract) {
    throw new Error(`No OpenGTM connector contract found for ${provider || family}`)
  }

  const connectorAction = mapHarnessActionToConnectorAction(contract, action)
  const mode = inferConnectorMode(contract, connectorAction)
  const requiresSession = contract.secretShape.length > 0
  const validation = validateConnectorSession(session, contract)
  const sessionStatus = validation.status
  const authState = validation.authState
  const executionMode = requiresSession && sessionStatus !== 'ready' ? 'simulated' : 'live'

  if (sessionStatus === 'error') {
    throw createConnectorExecutionError({
      provider: contract.provider,
      family: contract.family,
      action: connectorAction as any,
      retryable: true,
      authState,
      classification: 'provider',
      message: `Connector ${contract.provider} is in an error state for ${connectorAction}`
    })
  }

  return {
    provider: contract.provider,
    family: contract.family,
    action: connectorAction,
    requestedAction: action,
    mode,
    target,
    executionMode,
    requiresSession,
    sessionStatus,
    authState,
    validatedScopes: validation.validatedScopes,
    data: buildNormalizedData({
      family: contract.family,
      provider: contract.provider,
      action: action as any,
      target,
      payload
    })
  }
}