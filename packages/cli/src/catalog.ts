import { existsSync } from 'node:fs'

export type OpenGtmProviderKind = 'mock' | 'openai-compatible'
export type OpenGtmProviderAuthMode = 'none' | 'api-key' | 'oauth'

export interface OpenGtmProviderCatalogEntry {
  id: string
  label: string
  description: string
  kind: OpenGtmProviderKind
  supportTier: 'stable' | 'experimental'
  authMode: OpenGtmProviderAuthMode
  baseURL: string | null
  docsUrl: string | null
  defaultModel: string
  models: string[]
}

export interface OpenGtmAgentCatalogEntry {
  id: string
  name: string
  persona: string
  description: string
  defaultModel: string
  recommendedSkills: string[]
}

export interface OpenGtmSandboxProfile {
  id: string
  label: string
  description: string
  restrictions: string[]
  policy: string
}

export const OPEN_GTM_PROVIDER_CATALOG: readonly OpenGtmProviderCatalogEntry[] = [
  {
    id: 'mock',
    label: 'Mock provider',
    description: 'Deterministic provider for local smoke runs, demos, and evals.',
    kind: 'mock',
    supportTier: 'stable',
    authMode: 'none',
    baseURL: null,
    docsUrl: null,
    defaultModel: 'mock-0',
    models: ['mock-0']
  },
  {
    id: 'openai',
    label: 'OpenAI API',
    description: 'Official OpenAI API via the OpenAI-compatible provider contract.',
    kind: 'openai-compatible',
    supportTier: 'stable',
    authMode: 'oauth',
    baseURL: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/docs/models',
    defaultModel: 'gpt-5.2',
    models: ['gpt-5.2', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1']
  },
  {
    id: 'openai-compatible',
    label: 'Custom OpenAI-compatible',
    description: 'Bring your own OpenAI-compatible endpoint and model list.',
    kind: 'openai-compatible',
    supportTier: 'experimental',
    authMode: 'api-key',
    baseURL: null,
    docsUrl: null,
    defaultModel: 'custom',
    models: []
  }
] as const

export const OPEN_GTM_AGENT_CATALOG: readonly OpenGtmAgentCatalogEntry[] = [
  {
    id: 'supervisor',
    name: 'Supervisor',
    persona: 'cross',
    description: 'Coordinates GTM workflows, approvals, and operator-visible outcomes.',
    defaultModel: 'gpt-5.2',
    recommendedSkills: ['lead_research', 'outreach_compose', 'positioning_check']
  },
  {
    id: 'researcher',
    name: 'Researcher',
    persona: 'SDR',
    description: 'Collects account, contact, and market context into durable artifacts.',
    defaultModel: 'gpt-5-mini',
    recommendedSkills: ['lead_research', 'account_brief']
  },
  {
    id: 'account_health',
    name: 'Account health analyst',
    persona: 'CS',
    description: 'Surfaces renewal, risk, and health signals for active accounts.',
    defaultModel: 'gpt-5-mini',
    recommendedSkills: ['health_score', 'renewal_prep']
  },
  {
    id: 'persona_matcher',
    name: 'Persona matcher',
    persona: 'cross',
    description: 'Chooses the strongest buyer angle and GTM motion for a record.',
    defaultModel: 'gpt-5-mini',
    recommendedSkills: ['icp_scoring', 'positioning_check']
  },
  {
    id: 'drafter',
    name: 'Drafting specialist',
    persona: 'SDR',
    description: 'Produces grounded outreach drafts that stay inside approval gates.',
    defaultModel: 'gpt-5.2',
    recommendedSkills: ['outreach_compose', 'outreach_sequence']
  },
  {
    id: 'policy_checker',
    name: 'Policy checker',
    persona: 'cross',
    description: 'Evaluates send readiness, suppressions, and risk conditions.',
    defaultModel: 'gpt-5-mini',
    recommendedSkills: ['inbound_triage', 'positioning_check']
  }
] as const

export const OPEN_GTM_SANDBOX_PROFILES: readonly OpenGtmSandboxProfile[] = [
  {
    id: 'audit-only',
    label: 'Audit only',
    description: 'Runs with Seatbelt active but no extra deny rules beyond the host defaults.',
    restrictions: ['Records sandbox intent for governance', 'Useful for first-run validation'],
    policy: '(version 1) (allow default)'
  },
  {
    id: 'read-only',
    label: 'Read only',
    description: 'Denies file writes while allowing normal reads and process execution.',
    restrictions: ['deny file-write*'],
    policy: '(version 1) (allow default) (deny file-write*)'
  },
  {
    id: 'no-network',
    label: 'No network',
    description: 'Blocks outbound and inbound network access while preserving normal local execution.',
    restrictions: ['deny network*'],
    policy: '(version 1) (allow default) (deny network*)'
  },
  {
    id: 'read-only-no-network',
    label: 'Read only + no network',
    description: 'Combines read-only execution with no-network constraints.',
    restrictions: ['deny file-write*', 'deny network*'],
    policy: '(version 1) (allow default) (deny file-write*) (deny network*)'
  }
] as const

export function getProviderCatalogEntry(id: string) {
  return OPEN_GTM_PROVIDER_CATALOG.find((provider) => provider.id === id) || null
}

export function listProviderCatalog() {
  return [...OPEN_GTM_PROVIDER_CATALOG]
}

export function listModelsForProvider(providerId: string, customCurrentModel?: string | null) {
  const provider = getProviderCatalogEntry(providerId)
  if (!provider) return customCurrentModel ? [customCurrentModel] : []

  if (provider.models.length > 0) {
    if (customCurrentModel && !provider.models.includes(customCurrentModel)) {
      return [...provider.models, customCurrentModel]
    }
    return [...provider.models]
  }

  if (customCurrentModel && customCurrentModel !== 'custom') {
    return [customCurrentModel]
  }

  return provider.defaultModel === 'custom' ? [] : [provider.defaultModel]
}

export function listAgentCatalog() {
  return [...OPEN_GTM_AGENT_CATALOG]
}

export function getAgentCatalogEntry(id: string) {
  return OPEN_GTM_AGENT_CATALOG.find((agent) => agent.id === id) || null
}

export function listSandboxProfiles() {
  return [...OPEN_GTM_SANDBOX_PROFILES]
}

export function getSandboxProfile(id: string) {
  return OPEN_GTM_SANDBOX_PROFILES.find((profile) => profile.id === id) || null
}

export function isSeatbeltAvailable() {
  return process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec')
}
