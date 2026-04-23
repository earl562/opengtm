import { assertOneOf, createEntityBase, toIso } from './utils.js'
import type {
  OpenGtmAgentJob,
  OpenGtmAgentJobError,
  OpenGtmAgentJobInput,
  OpenGtmAgentJobUpdateInput,
  OpenGtmLane
} from '@opengtm/types'
import {
  OPEN_GTM_AGENT_JOB_STATUSES,
  OPEN_GTM_AGENT_JOB_TRANSITIONS,
  type OpenGtmAgentJobStatus
} from '@opengtm/types'

const TERMINAL_AGENT_JOB_STATUSES = new Set<OpenGtmAgentJobStatus>([
  'completed',
  'failed',
  'cancelled'
])

export function createAgentJob(input: OpenGtmAgentJobInput): OpenGtmAgentJob {
  const base = createEntityBase(input)
  const status = ((input.status || 'queued') as OpenGtmAgentJobStatus)
  assertOneOf(status, OPEN_GTM_AGENT_JOB_STATUSES, 'agent job status')

  const updatedAt = input.updatedAt ? toIso(input.updatedAt) : base.createdAt
  return {
    ...base,
    workspaceId: input.workspaceId,
    initiativeId: input.initiativeId,
    workItemId: input.workItemId || null,
    traceId: input.traceId || null,
    parentJobId: input.parentJobId || null,
    dependsOnJobIds: input.dependsOnJobIds || [],
    lane: input.lane as OpenGtmLane,
    agentType: input.agentType,
    goal: input.goal,
    status,
    progress: normalizeProgress(input.progress),
    summary: input.summary || null,
    constraints: input.constraints || [],
    requiredOutputs: input.requiredOutputs || [],
    sourceIds: input.sourceIds || [],
    artifactIds: input.artifactIds || [],
    approvalRequestId: input.approvalRequestId || null,
    output: input.output ?? null,
    error: input.error || null,
    metadata: input.metadata || {},
    startedAt: input.startedAt ? toIso(input.startedAt) : (status === 'running' ? updatedAt : null),
    updatedAt,
    endedAt: input.endedAt
      ? toIso(input.endedAt)
      : (TERMINAL_AGENT_JOB_STATUSES.has(status) ? updatedAt : null)
  }
}

export function updateAgentJob(
  job: OpenGtmAgentJob,
  updates: OpenGtmAgentJobUpdateInput
): OpenGtmAgentJob {
  const nextStatus = updates.status
    ? (updates.status as OpenGtmAgentJobStatus)
    : job.status
  assertOneOf(nextStatus, OPEN_GTM_AGENT_JOB_STATUSES, 'agent job status')

  if (nextStatus !== job.status) {
    const allowed = OPEN_GTM_AGENT_JOB_TRANSITIONS[job.status]
    assertOneOf(nextStatus, allowed, 'agent job transition')
  }

  const updatedAt = updates.updatedAt ? toIso(updates.updatedAt) : new Date().toISOString()
  const nextIsTerminal = TERMINAL_AGENT_JOB_STATUSES.has(nextStatus)
  const endedAt = updates.endedAt
    ? toIso(updates.endedAt)
    : resolveEndedAt(job, nextStatus, nextIsTerminal, updatedAt)

  return {
    ...job,
    status: nextStatus,
    progress: updates.progress === undefined ? job.progress : normalizeProgress(updates.progress),
    summary: updates.summary === undefined ? job.summary : updates.summary,
    sourceIds: updates.sourceIds === undefined ? job.sourceIds : updates.sourceIds,
    artifactIds: updates.artifactIds === undefined ? job.artifactIds : updates.artifactIds,
    approvalRequestId: updates.approvalRequestId === undefined ? job.approvalRequestId : updates.approvalRequestId,
    output: updates.output === undefined ? job.output : updates.output,
    error: updates.error === undefined ? job.error : updates.error,
    metadata: updates.metadata ? { ...job.metadata, ...updates.metadata } : job.metadata,
    traceId: updates.traceId === undefined ? job.traceId : updates.traceId,
    startedAt: resolveStartedAt(job, nextStatus, updatedAt),
    updatedAt,
    endedAt
  }
}

export function applySubagentStatusToAgentJob(
  job: OpenGtmAgentJob,
  statusUpdate: {
    status: string
    summary?: string
    progress?: number
    approvalRequestId?: string
  }
): OpenGtmAgentJob {
  return updateAgentJob(job, {
    status: statusUpdate.status,
    summary: statusUpdate.summary,
    progress: statusUpdate.progress,
    approvalRequestId: statusUpdate.approvalRequestId || undefined
  })
}

export function applySubagentFinalResultToAgentJob(
  job: OpenGtmAgentJob,
  result: {
    status: string
    summary?: string
    output?: unknown
    error?: OpenGtmAgentJobError
    artifacts?: string[]
  }
): OpenGtmAgentJob {
  return updateAgentJob(job, {
    status: result.status,
    summary: result.summary,
    output: result.output,
    error: result.error,
    artifactIds: result.artifacts
  })
}

function normalizeProgress(progress: number | null | undefined): number | null {
  if (progress === undefined || progress === null) return null
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new Error('Agent job progress must be between 0 and 100.')
  }
  return progress
}

function resolveEndedAt(
  job: OpenGtmAgentJob,
  nextStatus: OpenGtmAgentJobStatus,
  nextIsTerminal: boolean,
  updatedAt: string
): string | null {
  if (!nextIsTerminal) return null
  return job.status === nextStatus && job.endedAt ? job.endedAt : updatedAt
}

function resolveStartedAt(
  job: OpenGtmAgentJob,
  nextStatus: OpenGtmAgentJobStatus,
  updatedAt: string
): string | null {
  if (nextStatus === 'running') {
    if (job.status === 'blocked' || job.status === 'awaiting-approval') {
      return job.startedAt || updatedAt
    }
    if (job.status === 'running') {
      return job.startedAt || updatedAt
    }
    return updatedAt
  }

  if (nextStatus === 'queued') {
    return null
  }

  return job.startedAt
}
