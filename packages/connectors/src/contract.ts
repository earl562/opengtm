import { createConnectorContract, createConnectorSession } from '@opengtm/core'
import { normalizeConnectorFamily, type OpenGtmConnectorContract, type OpenGtmConnectorFamily, type OpenGtmConnectorSession } from '@opengtm/types'

export interface ConnectorSessionDescriptorInput {
  provider: string
  workspaceId: string
  scopes?: string[]
  authMode?: string
}

export interface ConnectorFamilyDescriptor {
  family: OpenGtmConnectorFamily
  label: string
  description: string
  capabilities: string[]
  readActions: string[]
  writeActions: string[]
  defaultApprovalMode: string
  traceRequired: boolean
  secretShape: string[]
}

export const CONNECTOR_FAMILY_DESCRIPTORS: Record<OpenGtmConnectorFamily, ConnectorFamilyDescriptor> = {
  crm: {
    family: 'crm',
    label: 'CRM',
    description: 'Canonical customer and pipeline records for accounts, leads, contacts, deals, and activity logs.',
    capabilities: ['lead.read', 'account.read', 'deal.read', 'activity.log'],
    readActions: ['call-api', 'read-connector'],
    writeActions: ['mutate-connector'],
    defaultApprovalMode: 'auto',
    traceRequired: true,
    secretShape: ['token']
  },
  enrichment: {
    family: 'enrichment',
    label: 'Enrichment',
    description: 'Firmographic, technographic, and contact enrichment lookups.',
    capabilities: ['account.enrich', 'contact.enrich'],
    readActions: ['call-api', 'read-connector'],
    writeActions: [],
    defaultApprovalMode: 'auto',
    traceRequired: true,
    secretShape: ['token']
  },
  web_research: {
    family: 'web_research',
    label: 'Web Research',
    description: 'Search and browse public web sources for GTM signal gathering.',
    capabilities: ['search', 'page.read'],
    readActions: ['read-connector', 'call-api'],
    writeActions: ['browser-act'],
    defaultApprovalMode: 'auto',
    traceRequired: true,
    secretShape: ['token']
  },
  meeting_intelligence: {
    family: 'meeting_intelligence',
    label: 'Meeting Intelligence',
    description: 'Meeting transcripts, recaps, and call-level intelligence.',
    capabilities: ['transcripts.read', 'meeting.read'],
    readActions: ['read-connector', 'call-api'],
    writeActions: ['mutate-connector'],
    defaultApprovalMode: 'auto',
    traceRequired: true,
    secretShape: ['token']
  },
  warehouse: {
    family: 'warehouse',
    label: 'Warehouse',
    description: 'Analytical query execution for product, revenue, and support reporting.',
    capabilities: ['query'],
    readActions: ['call-api', 'read-connector'],
    writeActions: [],
    defaultApprovalMode: 'auto',
    traceRequired: true,
    secretShape: ['token']
  },
  email: {
    family: 'email',
    label: 'Email',
    description: 'Email draft, schedule, send, and inbox retrieval operations.',
    capabilities: ['draft', 'schedule', 'send', 'thread.read'],
    readActions: ['read-connector', 'call-api'],
    writeActions: ['send-message', 'mutate-connector'],
    defaultApprovalMode: 'auto',
    traceRequired: true,
    secretShape: ['token']
  },
  calendar: {
    family: 'calendar',
    label: 'Calendar',
    description: 'Meetings, attendees, and scheduling operations.',
    capabilities: ['meeting.read', 'schedule', 'availability.read'],
    readActions: ['read-connector', 'call-api'],
    writeActions: ['mutate-connector'],
    defaultApprovalMode: 'auto',
    traceRequired: true,
    secretShape: ['token']
  },
  comms: {
    family: 'comms',
    label: 'Comms',
    description: 'Team communication channels for notifications and approval workflows.',
    capabilities: ['notify', 'approval', 'thread.read'],
    readActions: ['read-connector', 'call-api'],
    writeActions: ['send-message', 'mutate-connector'],
    defaultApprovalMode: 'auto',
    traceRequired: true,
    secretShape: ['token']
  },
  support: {
    family: 'support',
    label: 'Support',
    description: 'Support tickets, escalations, and account issue history.',
    capabilities: ['ticket.read', 'ticket.update'],
    readActions: ['read-connector', 'call-api'],
    writeActions: ['mutate-connector'],
    defaultApprovalMode: 'auto',
    traceRequired: true,
    secretShape: ['token']
  },
  docs: {
    family: 'docs',
    label: 'Docs',
    description: 'Knowledge documents, notes, and artifact storage.',
    capabilities: ['search', 'read', 'write'],
    readActions: ['read-connector', 'ingest-source'],
    writeActions: ['write-repo', 'mutate-connector'],
    defaultApprovalMode: 'auto',
    traceRequired: false,
    secretShape: []
  }
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

export function getConnectorFamilyDescriptor(family: string): ConnectorFamilyDescriptor | undefined {
  const canonicalFamily = normalizeConnectorFamily(family)
  return CONNECTOR_FAMILY_DESCRIPTORS[canonicalFamily]
}

export function createContractForFamily({
  family,
  provider,
  capabilities,
  readActions,
  writeActions,
  defaultApprovalMode,
  traceRequired,
  secretShape
}: {
  family: string
  provider: string
  capabilities?: string[]
  readActions?: string[]
  writeActions?: string[]
  defaultApprovalMode?: string
  traceRequired?: boolean
  secretShape?: string[]
}): OpenGtmConnectorContract {
  const descriptor = getConnectorFamilyDescriptor(family)
  if (!descriptor) {
    throw new Error(`Unknown OpenGTM connector family: ${family}`)
  }

  return createConnectorContract({
    family: descriptor.family,
    provider,
    capabilities: capabilities || descriptor.capabilities,
    readActions: readActions || descriptor.readActions,
    writeActions: writeActions || descriptor.writeActions,
    defaultApprovalMode: defaultApprovalMode || descriptor.defaultApprovalMode,
    traceRequired: traceRequired ?? descriptor.traceRequired,
    secretShape: secretShape || descriptor.secretShape
  })
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
  const family = normalizeConnectorFamily(input.family)
  return createConnectorSession({
    id: input.id,
    workspaceId: input.workspaceId,
    provider: input.provider,
    family,
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
