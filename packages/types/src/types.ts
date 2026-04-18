import type {
  OpenGtmLane,
  OpenGtmProductArea,
  OpenGtmSystemOfRecord,
  OpenGtmConnectorFamily,
  OpenGtmActionType,
  OpenGtmArtifactKind,
  OpenGtmConnectorSessionStatus,
  OpenGtmRunAttemptStatus,
  OpenGtmInitiativeHealthStatus,
  OpenGtmArchivalState,
  OpenGtmRedactionState,
  OpenGtmWorkflowRunStatus,
  OpenGtmMemoryType,
  OpenGtmFieldOwnership,
  OpenGtmRiskLevel,
  OpenGtmWorkItemStatus,
  OpenGtmApprovalStatus,
  OpenGtmInboxItemStatus,
  OpenGtmInboxItemKind,
  OpenGtmWorkflowStatus
} from './constants.js'

// === Base Types ===
export type OpenGtmStringMap = Record<string, string>
export type OpenGtmUnknownMap = Record<string, unknown>

export interface OpenGtmEntityBase {
  id: string
  createdAt: string
}

// === Work Item ===
export interface OpenGtmWorkItem extends OpenGtmEntityBase {
  workspaceId: string
  initiativeId: string
  workflowId: string | null
  workflowRunId: string | null
  journeyId: string | null
  ownerLane: OpenGtmLane
  title: string
  goal: string
  status: OpenGtmWorkItemStatus
  riskLevel: OpenGtmRiskLevel
  leaseOwner: string | null
  leaseExpiresAt: string | null
  constraints: string[]
  requiredOutputs: string[]
  sourceIds: string[]
  connectorTargets: string[]
}

export interface OpenGtmWorkItemInput {
  id?: string
  workspaceId: string
  initiativeId: string
  workflowId?: string | null
  workflowRunId?: string | null
  journeyId?: string | null
  ownerLane: string
  title: string
  goal: string
  status?: string
  riskLevel?: string
  leaseOwner?: string | null
  leaseExpiresAt?: string | Date | null
  constraints?: string[]
  requiredOutputs?: string[]
  sourceIds?: string[]
  connectorTargets?: string[]
  createdAt?: string | Date
}

// === Artifact ===
export interface OpenGtmArtifactRecord extends OpenGtmEntityBase {
  workspaceId: string
  initiativeId: string
  kind: OpenGtmArtifactKind
  lane: OpenGtmLane
  title: string
  contentRef: string | null
  sourceIds: string[]
  traceRef: string | null
  provenance: string[]
}

export interface OpenGtmArtifactInput {
  id?: string
  workspaceId: string
  initiativeId: string
  kind: string
  lane: string
  title: string
  contentRef?: string | null
  sourceIds?: string[]
  traceRef?: string | null
  provenance?: string[]
  createdAt?: string | Date
}

// === Memory ===
export interface OpenGtmMemoryRecord extends OpenGtmEntityBase {
  workspaceId: string
  memoryType: OpenGtmMemoryType
  scope: string
  contentRef: string
  sourceIds: string[]
  retentionPolicy: string
  ttlDays: number | null
  archivalState: OpenGtmArchivalState
  redactionState: OpenGtmRedactionState
  promotionSource: string | null
  retrievalHints: string[]
}

export interface OpenGtmMemoryRecordInput {
  id?: string
  workspaceId: string
  memoryType: string
  scope: string
  contentRef: string
  sourceIds?: string[]
  retentionPolicy?: string
  ttlDays?: number | null
  archivalState?: string
  redactionState?: string
  promotionSource?: string | null
  retrievalHints?: string[]
  createdAt?: string | Date
}

// === Connectors ===
export interface OpenGtmConnectorContract {
  family: OpenGtmConnectorFamily
  provider: string
  capabilities: string[]
  readActions: string[]
  writeActions: string[]
  defaultApprovalMode: string
  traceRequired: boolean
  secretShape: string[]
}

export interface OpenGtmConnectorContractInput {
  family: string
  provider: string
  capabilities?: string[]
  readActions?: string[]
  writeActions?: string[]
  defaultApprovalMode?: string
  traceRequired?: boolean
  secretShape?: string[]
}

export interface OpenGtmConnectorSession extends OpenGtmEntityBase {
  workspaceId: string
  provider: string
  family: OpenGtmConnectorFamily
  authMode: string
  status: OpenGtmConnectorSessionStatus
  scopes: string[]
  expiresAt: string | null
  refreshAt: string | null
  secretRef: string | null
  providerAccountRef: string | null
  lastError: string | null
  capabilityStatus: OpenGtmStringMap
  validatedScopes: string[]
  lastValidatedAt: string | null
}

export interface OpenGtmConnectorSessionInput {
  id?: string
  workspaceId: string
  provider: string
  family: string
  authMode?: string
  status?: string
  scopes?: string[]
  expiresAt?: string | Date | null
  refreshAt?: string | Date | null
  secretRef?: string | null
  providerAccountRef?: string | null
  lastError?: string | null
  capabilityStatus?: OpenGtmStringMap
  validatedScopes?: string[]
  lastValidatedAt?: string | Date | null
  createdAt?: string | Date
}

export interface OpenGtmConnectorExecutionError {
  id: string
  provider: string
  family: OpenGtmConnectorFamily
  action: OpenGtmActionType
  retryable: boolean
  authState: string
  classification: string
  message: string
  createdAt: string
}

export interface OpenGtmConnectorExecutionErrorInput {
  id?: string
  provider: string
  family: string
  action: string
  retryable?: boolean
  authState?: string
  classification?: string
  message: string
  createdAt?: string | Date
}

// === Policy ===
export interface OpenGtmPolicyDecision extends OpenGtmEntityBase {
  workItemId: string
  lane: OpenGtmLane
  actionType: OpenGtmActionType
  connectorFamily: string | null
  target: string
  riskLevel: OpenGtmRiskLevel
  decision: string
  approvalRequired: boolean
  reason: string
}

export interface OpenGtmPolicyDecisionInput {
  id?: string
  workItemId: string
  lane: string
  actionType: string
  connectorFamily?: string | null
  target?: string
  riskLevel?: string
  decision: string
  approvalRequired: boolean
  reason: string
  createdAt?: string | Date
}

export interface OpenGtmApprovalRequest extends OpenGtmEntityBase {
  workspaceId: string
  workItemId: string
  lane: OpenGtmLane
  actionSummary: string
  riskLevel: OpenGtmRiskLevel
  target: string
  status: OpenGtmApprovalStatus
  decisionRef: string | null
}

export interface OpenGtmApprovalRequestInput {
  id?: string
  workspaceId: string
  workItemId: string
  lane: string
  actionSummary: string
  riskLevel: string
  target: string
  status?: string
  decisionRef?: string | null
  createdAt?: string | Date
}

// === Handoff ===
export interface OpenGtmHandoffPacket extends OpenGtmEntityBase {
  workItemId: string
  fromLane: OpenGtmLane
  toLane: OpenGtmLane
  goal: string
  contextArtifacts: string[]
  constraints: string[]
  approvalState: string
  requiredOutputs: string[]
}

export interface OpenGtmHandoffPacketInput {
  id?: string
  workItemId: string
  fromLane: string
  toLane: string
  goal: string
  contextArtifacts?: string[]
  constraints?: string[]
  approvalState?: string
  requiredOutputs?: string[]
  createdAt?: string | Date
}

// === Trace ===
export interface OpenGtmRunTraceStep {
  name: string
  status?: string
  [key: string]: unknown
}

export interface OpenGtmRunTrace extends OpenGtmEntityBase {
  workItemId: string
  lane: OpenGtmLane
  status: string
  steps: OpenGtmRunTraceStep[]
  toolCalls: OpenGtmUnknownMap[]
  connectorCalls: OpenGtmUnknownMap[]
  policyDecisionIds: string[]
  artifactIds: string[]
  runAttemptId: string | null
  observedFacts: OpenGtmUnknownMap[]
  inferences: OpenGtmUnknownMap[]
  actionRequests: OpenGtmUnknownMap[]
  redactionMarkers: string[]
  startedAt: string
  endedAt: string | null
}

export interface OpenGtmRunTraceInput {
  id?: string
  workItemId: string
  lane: string
  status?: string
  steps?: OpenGtmRunTraceStep[]
  toolCalls?: OpenGtmUnknownMap[]
  connectorCalls?: OpenGtmUnknownMap[]
  policyDecisionIds?: string[]
  artifactIds?: string[]
  runAttemptId?: string | null
  observedFacts?: OpenGtmUnknownMap[]
  inferences?: OpenGtmUnknownMap[]
  actionRequests?: OpenGtmUnknownMap[]
  redactionMarkers?: string[]
  startedAt?: string | Date
  endedAt?: string | Date | null
}

// === Workspace ===
export interface OpenGtmWorkspace extends OpenGtmEntityBase {
  name: string
  slug: string
  policyProfile: string
  defaultConnectors: string[]
}

export interface OpenGtmWorkspaceInput {
  id?: string
  name: string
  slug?: string
  policyProfile?: string
  defaultConnectors?: string[]
  createdAt?: string | Date
}

// === System Record ===
export interface OpenGtmSystemRecord extends OpenGtmEntityBase {
  workspaceId: string
  initiativeId: string | null
  accountId: string | null
  system: OpenGtmSystemOfRecord
  objectType: string
  objectRef: string
  canonicalFields: OpenGtmUnknownMap
  mirroredFields: OpenGtmUnknownMap
  derivedFields: OpenGtmUnknownMap
}

export interface OpenGtmSystemRecordInput {
  id?: string
  workspaceId: string
  initiativeId?: string | null
  accountId?: string | null
  system: string
  objectType: string
  objectRef: string
  canonicalFields?: OpenGtmUnknownMap
  mirroredFields?: OpenGtmUnknownMap
  derivedFields?: OpenGtmUnknownMap
  createdAt?: string | Date
}

// === Initiative ===
export interface OpenGtmInitiative extends OpenGtmEntityBase {
  workspaceId: string
  title: string
  summary: string
  status: string
  owners: string[]
  sourceIds: string[]
  accountIds: string[]
  artifactIds: string[]
  workflowIds: string[]
  journeyIds: string[]
  health: OpenGtmInitiativeHealthStatus
  activeInitiativeId: string | null
}

export interface OpenGtmInitiativeInput {
  id?: string
  workspaceId: string
  title: string
  summary?: string
  status?: string
  owners?: string[]
  sourceIds?: string[]
  accountIds?: string[]
  artifactIds?: string[]
  workflowIds?: string[]
  journeyIds?: string[]
  health?: string
  activeInitiativeId?: string | null
}

export interface OpenGtmInitiativeSummary {
  id: string
  workspaceId: string
  title: string
  summary: string
  status: string
  health: OpenGtmInitiativeHealthStatus
  ownerCount: number
  activeRunCount: number
  completedWorkItemCount: number
  pendingApprovalCount: number
}

// === Account ===
export interface OpenGtmAccount extends OpenGtmEntityBase {
  workspaceId: string
  name: string
  domain: string
  tier: string
  metadata: OpenGtmUnknownMap
}

export interface OpenGtmAccountInput {
  id?: string
  workspaceId: string
  name: string
  domain: string
  tier?: string
  metadata?: OpenGtmUnknownMap
  createdAt?: string | Date
}

export interface OpenGtmContact extends OpenGtmEntityBase {
  accountId: string
  name: string
  email: string
  role: string
  metadata: OpenGtmUnknownMap
}

export interface OpenGtmContactInput {
  id?: string
  accountId: string
  name: string
  email: string
  role?: string
  metadata?: OpenGtmUnknownMap
  createdAt?: string | Date
}

// === Journey ===
export interface OpenGtmJourney extends OpenGtmEntityBase {
  workspaceId: string
  initiativeId: string
  name: string
  description: string
  workItemIds: string[]
}

export interface OpenGtmJourneyInput {
  id?: string
  workspaceId: string
  initiativeId: string
  name: string
  description?: string
  workItemIds?: string[]
  createdAt?: string | Date
}

// === Inbox ===
export interface OpenGtmInboxItem extends OpenGtmEntityBase {
  workspaceId: string
  initiativeId: string
  kind: OpenGtmInboxItemKind
  status: OpenGtmInboxItemStatus
  title: string
  content: string
  sourceRef: string | null
}

export interface OpenGtmInboxItemInput {
  id?: string
  workspaceId: string
  initiativeId: string
  kind: string
  status?: string
  title: string
  content?: string
  sourceRef?: string | null
  createdAt?: string | Date
}

// === Analytics ===
export interface OpenGtmAnalyticsSnapshot extends OpenGtmEntityBase {
  workspaceId: string
  initiativeId: string
  workItemCount: number
  completedWorkItemCount: number
  failedWorkItemCount: number
  averageCycleTimeHours: number
}

export interface OpenGtmAnalyticsSnapshotInput {
  id?: string
  workspaceId: string
  initiativeId: string
  workItemCount?: number
  completedWorkItemCount?: number
  failedWorkItemCount?: number
  averageCycleTimeHours?: number
  createdAt?: string | Date
}

// === Conversation ===
export interface OpenGtmConversationThread extends OpenGtmEntityBase {
  workspaceId: string
  initiativeId: string
  messages: OpenGtmUnknownMap[]
}

export interface OpenGtmConversationThreadInput {
  id?: string
  workspaceId: string
  initiativeId: string
  messages?: OpenGtmUnknownMap[]
  createdAt?: string | Date
}

// === Workflow ===
export interface OpenGtmWorkflow extends OpenGtmEntityBase {
  workspaceId: string
  name: string
  description: string
  trigger: string
  lane: OpenGtmLane
  status: OpenGtmWorkflowStatus
}

export interface OpenGtmWorkflowInput {
  id?: string
  workspaceId: string
  name: string
  description?: string
  trigger?: string
  lane?: string
  status?: string
  createdAt?: string | Date
}

export interface OpenGtmWorkflowRun extends OpenGtmEntityBase {
  workflowId: string
  status: OpenGtmWorkflowRunStatus
  input: OpenGtmUnknownMap
  output: OpenGtmUnknownMap
  error: string | null
}

export interface OpenGtmWorkflowRunInput {
  id?: string
  workflowId: string
  status?: string
  input?: OpenGtmUnknownMap
  output?: OpenGtmUnknownMap
  error?: string | null
  createdAt?: string | Date
}

// === Run Attempt ===
export interface OpenGtmRunAttempt extends OpenGtmEntityBase {
  workItemId: string
  status: OpenGtmRunAttemptStatus
  startedAt: string
  endedAt: string | null
}

export interface OpenGtmRunAttemptInput {
  id?: string
  workItemId: string
  status?: string
  startedAt?: string | Date
  endedAt?: string | Date | null
  createdAt?: string | Date
}

// === Audit ===
export interface OpenGtmAuditEvent extends OpenGtmEntityBase {
  workspaceId: string
  eventType: string
  entityType: string
  entityId: string
  actor: string
  changes: OpenGtmUnknownMap
}

export interface OpenGtmAuditEventInput {
  id?: string
  workspaceId: string
  eventType: string
  entityType: string
  entityId: string
  actor: string
  changes?: OpenGtmUnknownMap
  createdAt?: string | Date
}

// === Reconcile ===
export interface OpenGtmReconciliationReport {
  id: string
  workspaceId: string
  system: OpenGtmSystemOfRecord
  processed: number
  created: number
  updated: number
  errors: string[]
  createdAt: string
}

export interface OpenGtmReconciliationReportInput {
  id?: string
  workspaceId: string
  system: string
  processed?: number
  created?: number
  updated?: number
  errors?: string[]
  createdAt?: string | Date
}

// === Skill ===
export interface OpenGtmSkill extends OpenGtmEntityBase {
  name: string
  version: string
  disclosure: string
  description: string
  requirements: string[]
}

export interface OpenGtmSkillInput {
  id?: string
  name: string
  version: string
  disclosure?: string
  description?: string
  requirements?: string[]
}