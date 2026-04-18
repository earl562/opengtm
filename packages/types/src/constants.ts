// OpenGTM Constants - Extracted from opengtm-core
// These define the canonical enumerations and state machines for the domain

// === Version ===
export const OPEN_GTM_RUNTIME_CONTRACT_VERSION = '0.3.0'

// === Lanes ===
export const OPEN_GTM_LANES = [
  'research',
  'build-integrate',
  'ops-automate'
] as const

export type OpenGtmLane = typeof OPEN_GTM_LANES[number]

// === Product Areas ===
export const OPEN_GTM_PRODUCT_AREAS = [
  'initiatives',
  'knowledge',
  'build',
  'accounts',
  'journeys',
  'inbox',
  'analytics',
  'control'
] as const

export type OpenGtmProductArea = typeof OPEN_GTM_PRODUCT_AREAS[number]

// === Systems of Record ===
export const OPEN_GTM_SYSTEMS_OF_RECORD = [
  'crm',
  'product-analytics',
  'docs-knowledge',
  'communications',
  'repo-internal-tools'
] as const

export type OpenGtmSystemOfRecord = typeof OPEN_GTM_SYSTEMS_OF_RECORD[number]

// === Connector Families ===
export const OPEN_GTM_CONNECTOR_FAMILIES = [
  'docs-knowledge',
  'sheets-tables',
  'crm',
  'browser-automation',
  'email-calendar',
  'api-internal-tools'
] as const

export type OpenGtmConnectorFamily = typeof OPEN_GTM_CONNECTOR_FAMILIES[number]

// === Action Types ===
export const OPEN_GTM_ACTION_TYPES = [
  'ingest-source',
  'synthesize',
  'read-connector',
  'write-repo',
  'call-api',
  'mutate-connector',
  'browser-act',
  'send-message',
  'store-memory',
  'create-approval',
  'run-workflow',
  'handoff'
] as const

export type OpenGtmActionType = typeof OPEN_GTM_ACTION_TYPES[number]

// === Artifact Kinds ===
export const OPEN_GTM_ARTIFACT_KINDS = [
  'source-record',
  'synthesis',
  'pain-point',
  'handoff-packet',
  'decision-log',
  'trace',
  'spec',
  'campaign-brief',
  'analysis',
  'approval',
  'reconciliation-report'
] as const

export type OpenGtmArtifactKind = typeof OPEN_GTM_ARTIFACT_KINDS[number]

// === Connector Session Statuses ===
export const OPEN_GTM_CONNECTOR_SESSION_STATUSES = [
  'missing-auth',
  'configured',
  'ready',
  'expired',
  'error'
] as const

export type OpenGtmConnectorSessionStatus = typeof OPEN_GTM_CONNECTOR_SESSION_STATUSES[number]

// === Run Attempt Statuses ===
export const OPEN_GTM_RUN_ATTEMPT_STATUSES = [
  'running',
  'awaiting-approval',
  'completed',
  'failed',
  'cancelled'
] as const

export type OpenGtmRunAttemptStatus = typeof OPEN_GTM_RUN_ATTEMPT_STATUSES[number]

// === Initiative Health Statuses ===
export const OPEN_GTM_INITIATIVE_HEALTH_STATUSES = [
  'healthy',
  'running',
  'awaiting-approval',
  'blocked',
  'degraded'
] as const

export type OpenGtmInitiativeHealthStatus = typeof OPEN_GTM_INITIATIVE_HEALTH_STATUSES[number]

// === Archival States ===
export const OPEN_GTM_ARCHIVAL_STATES = [
  'active',
  'archived'
] as const

export type OpenGtmArchivalState = typeof OPEN_GTM_ARCHIVAL_STATES[number]

// === Redaction States ===
export const OPEN_GTM_REDACTION_STATES = [
  'visible',
  'redacted'
] as const

export type OpenGtmRedactionState = typeof OPEN_GTM_REDACTION_STATES[number]

// === Workflow Run Statuses ===
export const OPEN_GTM_WORKFLOW_RUN_STATUSES = [
  'running',
  'completed',
  'failed'
] as const

export type OpenGtmWorkflowRunStatus = typeof OPEN_GTM_WORKFLOW_RUN_STATUSES[number]

// === Memory Types ===
export const OPEN_GTM_MEMORY_TYPES = [
  'working',
  'episodic',
  'semantic',
  'personalized'
] as const

export type OpenGtmMemoryType = typeof OPEN_GTM_MEMORY_TYPES[number]

// === Field Ownership ===
export const OPEN_GTM_FIELD_OWNERSHIP = [
  'canonical',
  'mirrored',
  'derived'
] as const

export type OpenGtmFieldOwnership = typeof OPEN_GTM_FIELD_OWNERSHIP[number]

// === Risk Levels ===
export const OPEN_GTM_RISK_LEVELS = [
  'low',
  'medium',
  'high',
  'critical'
] as const

export type OpenGtmRiskLevel = typeof OPEN_GTM_RISK_LEVELS[number]

// === Work Item Statuses ===
export const OPEN_GTM_WORK_ITEM_STATUSES = [
  'queued',
  'running',
  'blocked',
  'awaiting-approval',
  'completed',
  'failed',
  'cancelled'
] as const

export type OpenGtmWorkItemStatus = typeof OPEN_GTM_WORK_ITEM_STATUSES[number]

// === Approval Statuses ===
export const OPEN_GTM_APPROVAL_STATUSES = [
  'pending',
  'approved',
  'denied',
  'expired'
] as const

export type OpenGtmApprovalStatus = typeof OPEN_GTM_APPROVAL_STATUSES[number]

// === Inbox Item Statuses ===
export const OPEN_GTM_INBOX_ITEM_STATUSES = [
  'open',
  'in-review',
  'resolved',
  'dismissed'
] as const

export type OpenGtmInboxItemStatus = typeof OPEN_GTM_INBOX_ITEM_STATUSES[number]

// === Inbox Item Kinds ===
export const OPEN_GTM_INBOX_ITEM_KINDS = [
  'approval',
  'exception',
  'review',
  'notification',
  'handoff'
] as const

export type OpenGtmInboxItemKind = typeof OPEN_GTM_INBOX_ITEM_KINDS[number]

// === Workflow Statuses ===
export const OPEN_GTM_WORKFLOW_STATUSES = [
  'draft',
  'enabled',
  'paused',
  'running',
  'failed',
  'completed'
] as const

export type OpenGtmWorkflowStatus = typeof OPEN_GTM_WORKFLOW_STATUSES[number]

// === State Machine Transitions ===
export const OPEN_GTM_WORK_ITEM_TRANSITIONS: Record<OpenGtmWorkItemStatus, OpenGtmWorkItemStatus[]> = {
  queued: ['running', 'cancelled', 'awaiting-approval', 'blocked'],
  running: ['awaiting-approval', 'blocked', 'completed', 'failed', 'cancelled'],
  blocked: ['queued', 'cancelled', 'failed'],
  'awaiting-approval': ['queued', 'cancelled', 'failed'],
  completed: [],
  failed: ['queued', 'cancelled'],
  cancelled: []
}

export const OPEN_GTM_APPROVAL_TRANSITIONS: Record<OpenGtmApprovalStatus, OpenGtmApprovalStatus[]> = {
  pending: ['approved', 'denied', 'expired'],
  approved: [],
  denied: [],
  expired: []
}

export const OPEN_GTM_INBOX_ITEM_TRANSITIONS: Record<OpenGtmInboxItemStatus, OpenGtmInboxItemStatus[]> = {
  open: ['in-review', 'resolved', 'dismissed'],
  'in-review': ['open', 'resolved', 'dismissed'],
  resolved: [],
  dismissed: []
}

export const OPEN_GTM_WORKFLOW_TRANSITIONS: Record<OpenGtmWorkflowStatus, OpenGtmWorkflowStatus[]> = {
  draft: ['enabled', 'paused'],
  enabled: ['running', 'paused'],
  paused: ['enabled'],
  running: ['completed', 'failed', 'paused'],
  failed: ['enabled', 'paused'],
  completed: ['enabled', 'paused']
}

export const OPEN_GTM_WORKFLOW_RUN_TRANSITIONS: Record<OpenGtmWorkflowRunStatus, OpenGtmWorkflowRunStatus[]> = {
  running: ['completed', 'failed'],
  completed: [],
  failed: []
}

export const OPEN_GTM_RUN_ATTEMPT_TRANSITIONS: Record<OpenGtmRunAttemptStatus, OpenGtmRunAttemptStatus[]> = {
  running: ['awaiting-approval', 'completed', 'failed', 'cancelled'],
  'awaiting-approval': ['cancelled', 'failed'],
  completed: [],
  failed: [],
  cancelled: []
}

// === Lane Policies ===
export const OPEN_GTM_LANE_POLICIES: Record<OpenGtmLane, {
  defaultSandbox: 'read-only' | 'workspace-write'
  externalMutationRequiresApproval: boolean
  repoMutationRequiresApproval: boolean
  connectorFamilies: OpenGtmConnectorFamily[]
  traceRequired: boolean
}> = {
  research: {
    defaultSandbox: 'read-only',
    externalMutationRequiresApproval: true,
    repoMutationRequiresApproval: true,
    connectorFamilies: ['docs-knowledge', 'sheets-tables', 'crm', 'api-internal-tools'],
    traceRequired: true
  },
  'build-integrate': {
    defaultSandbox: 'workspace-write',
    externalMutationRequiresApproval: true,
    repoMutationRequiresApproval: true,
    connectorFamilies: ['docs-knowledge', 'api-internal-tools', 'sheets-tables'],
    traceRequired: true
  },
  'ops-automate': {
    defaultSandbox: 'read-only',
    externalMutationRequiresApproval: true,
    repoMutationRequiresApproval: true,
    connectorFamilies: ['crm', 'browser-automation', 'email-calendar', 'docs-knowledge', 'sheets-tables'],
    traceRequired: true
  }
}