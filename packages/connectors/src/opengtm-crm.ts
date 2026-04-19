import type { OpenGtmConnectorContract } from '@opengtm/types'
import { createContractForFamily } from './contract.js'

export const OPENGTM_CRM_CONNECTOR_PROVIDER = 'opengtm-crm'

export interface OpenGtmCrmAccount {
  id: string
  name: string
  createdAt: string
}

export interface OpenGtmCrmLead {
  id: string
  name: string
  email: string | null
  status: 'new' | 'qualified' | 'disqualified'
  createdAt: string
}

export interface OpenGtmCrmActivity {
  id: string
  subject: string
  type: 'note' | 'call' | 'email'
  relatedType: 'account' | 'lead' | 'opportunity' | null
  relatedId: string | null
  createdAt: string
}

export interface OpenGtmCrmCreateAccountInput {
  name: string
}

export interface OpenGtmCrmCreateLeadInput {
  name: string
  email?: string | null
}

export interface OpenGtmCrmCreateActivityInput {
  subject: string
  type: OpenGtmCrmActivity['type']
  relatedType?: OpenGtmCrmActivity['relatedType']
  relatedId?: string | null
}

export interface OpenGtmCrmConnectorOptions {
  baseUrl: string
  fetch?: typeof globalThis.fetch
  headers?: Record<string, string>
}

export interface OpenGtmCrmExecutionInput {
  action: string
  target: string
  payload?: Record<string, unknown>
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function resolveTargetPath(target: string): '/health' | '/accounts' | '/leads' | '/activities' {
  const normalized = target.replace(/^\/+/, '').split(/[/?#]/, 1)[0]?.toLowerCase() || ''

  if (normalized === 'health') return '/health'
  if (normalized === 'accounts') return '/accounts'
  if (normalized === 'leads') return '/leads'
  if (normalized === 'activities') return '/activities'

  throw new Error(`Unsupported opengtm-crm target: ${target}`)
}

function resolveMethod(action: string, path: string): 'GET' | 'POST' {
  if (path === '/health') {
    if (action !== 'read-connector' && action !== 'call-api') {
      throw new Error(`Unsupported opengtm-crm action for health: ${action}`)
    }
    return 'GET'
  }

  if (action === 'read-connector' || action === 'call-api' || action === 'account.read' || action === 'lead.read') {
    return 'GET'
  }

  if (action === 'mutate-connector' || action === 'activity.log') {
    return 'POST'
  }

  throw new Error(`Unsupported opengtm-crm action: ${action}`)
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T
  if (!response.ok) {
    throw new Error(`opengtm-crm request failed (${response.status})`)
  }
  return body
}

export function createOpenGtmCrmConnectorContract(): OpenGtmConnectorContract {
  return createContractForFamily({
    provider: OPENGTM_CRM_CONNECTOR_PROVIDER,
    family: 'crm',
    capabilities: ['account.read', 'lead.read', 'activity.log'],
    readActions: ['read-connector', 'call-api'],
    writeActions: ['mutate-connector'],
    secretShape: []
  })
}

export function createOpenGtmCrmConnector(options: OpenGtmCrmConnectorOptions) {
  const fetchImpl = options.fetch ?? globalThis.fetch

  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is unavailable for opengtm-crm connector')
  }

  const baseUrl = trimTrailingSlash(options.baseUrl)

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(options.headers || {}),
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(init?.headers || {})
      }
    })
    return parseJson<T>(response)
  }

  return {
    provider: OPENGTM_CRM_CONNECTOR_PROVIDER,
    family: 'crm' as const,
    async getHealth(): Promise<{ ok: true }> {
      return request('/health')
    },
    async listAccounts(): Promise<OpenGtmCrmAccount[]> {
      const response = await request<{ data: OpenGtmCrmAccount[] }>('/accounts')
      return response.data
    },
    async createAccount(input: OpenGtmCrmCreateAccountInput): Promise<OpenGtmCrmAccount> {
      const response = await request<{ data: OpenGtmCrmAccount }>('/accounts', {
        method: 'POST',
        body: JSON.stringify(input)
      })
      return response.data
    },
    async listLeads(): Promise<OpenGtmCrmLead[]> {
      const response = await request<{ data: OpenGtmCrmLead[] }>('/leads')
      return response.data
    },
    async createLead(input: OpenGtmCrmCreateLeadInput): Promise<OpenGtmCrmLead> {
      const response = await request<{ data: OpenGtmCrmLead }>('/leads', {
        method: 'POST',
        body: JSON.stringify(input)
      })
      return response.data
    },
    async listActivities(): Promise<OpenGtmCrmActivity[]> {
      const response = await request<{ data: OpenGtmCrmActivity[] }>('/activities')
      return response.data
    },
    async createActivity(input: OpenGtmCrmCreateActivityInput): Promise<OpenGtmCrmActivity> {
      const response = await request<{ data: OpenGtmCrmActivity }>('/activities', {
        method: 'POST',
        body: JSON.stringify(input)
      })
      return response.data
    },
    async execute({ action, target, payload = {} }: OpenGtmCrmExecutionInput) {
      const path = resolveTargetPath(target)
      const method = resolveMethod(action, path)
      const response = await request<{ ok: true } | { data: unknown }>(path, {
        method,
        body: method === 'POST' ? JSON.stringify(payload) : undefined
      })

      return {
        provider: OPENGTM_CRM_CONNECTOR_PROVIDER,
        family: 'crm' as const,
        action: method === 'POST' ? 'mutate-connector' : 'read-connector',
        requestedAction: action,
        mode: method === 'POST' ? 'write' as const : 'read' as const,
        target,
        executionMode: 'live' as const,
        requiresSession: false,
        sessionStatus: 'ready',
        authState: 'not-required',
        validatedScopes: [],
        data: 'data' in response ? response.data : response
      }
    }
  }
}
