import type { OpenGtmConnectorContract } from '@opengtm/types'

export function supportsConnectorAction(contract: OpenGtmConnectorContract, action: string, mode = 'read') {
  const actions = mode === 'write' ? contract.writeActions : contract.readActions
  return actions.includes(action)
}

function inferConnectorMode(contract: OpenGtmConnectorContract, action: string) {
  if (supportsConnectorAction(contract, action, 'write')) return 'write'
  if (supportsConnectorAction(contract, action, 'read')) return 'read'
  throw new Error(`Connector ${contract.provider} does not support action ${action}`)
}

function mapHarnessActionToConnectorAction(contract: OpenGtmConnectorContract, action: string) {
  if (contract.capabilities.includes(action) || contract.readActions.includes(action) || contract.writeActions.includes(action)) {
    return action
  }

  if (action === 'ingest-source' || action === 'synthesize' || action === 'read-connector') {
    return contract.readActions[0]
  }

  if (action === 'mutate-connector' || action === 'send-message' || action === 'browser-act') {
    return contract.writeActions[0] || contract.readActions[0]
  }

  if (action === 'call-api') {
    return contract.readActions[0] || contract.writeActions[0]
  }

  return action
}

export { inferConnectorMode, mapHarnessActionToConnectorAction }