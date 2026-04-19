import type { OpenGtmConnectorContract } from '@opengtm/types'
import { createContractForFamily } from './contract.js'

// CI-friendly, deterministic connector contracts.
// These are contracts only: execution is simulated by `executeConnectorAction` when session is missing.
export function buildMockConnectorBundle(): OpenGtmConnectorContract[] {
  return [
    createContractForFamily({ provider: 'mock-docs', family: 'docs' }),
    createContractForFamily({ provider: 'mock-crm', family: 'crm' }),
    createContractForFamily({ provider: 'mock-enrichment', family: 'enrichment' }),
    createContractForFamily({ provider: 'mock-web', family: 'web_research' }),
    createContractForFamily({ provider: 'mock-meetings', family: 'meeting_intelligence' }),
    createContractForFamily({ provider: 'mock-warehouse', family: 'warehouse' }),
    createContractForFamily({ provider: 'mock-email', family: 'email' }),
    createContractForFamily({ provider: 'mock-calendar', family: 'calendar' }),
    createContractForFamily({ provider: 'mock-comms', family: 'comms' }),
    createContractForFamily({ provider: 'mock-support', family: 'support' })
  ]
}
