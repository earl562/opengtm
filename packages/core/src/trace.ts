import { createEntityBase } from './utils.js'
import type { OpenGtmRunTrace, OpenGtmRunTraceInput, OpenGtmRunTraceStep } from '@opengtm/types'
import { OPEN_GTM_LANES, type OpenGtmLane } from '@opengtm/types'

export function createRunTrace(input: OpenGtmRunTraceInput): OpenGtmRunTrace {
  const base = createEntityBase(input)
  return {
    ...base,
    workItemId: input.workItemId,
    lane: input.lane as OpenGtmLane,
    status: input.status || 'running',
    steps: input.steps || [],
    toolCalls: input.toolCalls || [],
    connectorCalls: input.connectorCalls || [],
    policyDecisionIds: input.policyDecisionIds || [],
    artifactIds: input.artifactIds || [],
    runAttemptId: input.runAttemptId || null,
    observedFacts: input.observedFacts || [],
    inferences: input.inferences || [],
    actionRequests: input.actionRequests || [],
    redactionMarkers: input.redactionMarkers || [],
    startedAt: input.startedAt ? new Date(input.startedAt).toISOString() : new Date().toISOString(),
    endedAt: input.endedAt ? new Date(input.endedAt).toISOString() : null
  }
}

export function updateRunTrace(trace: OpenGtmRunTrace, updates: Partial<Pick<OpenGtmRunTrace, 'status' | 'steps' | 'endedAt'>>): OpenGtmRunTrace {
  return {
    ...trace,
    ...updates,
    endedAt: updates.endedAt ? new Date(updates.endedAt).toISOString() : trace.endedAt
  }
}