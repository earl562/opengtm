import { createEntityBase } from './utils.js'
import { assertOneOf } from './utils.js'
import type { OpenGtmWorkflow, OpenGtmWorkflowInput, OpenGtmWorkflowRun, OpenGtmWorkflowRunInput } from '@opengtm/types'
import {
  OPEN_GTM_LANES,
  OPEN_GTM_WORKFLOW_STATUSES,
  OPEN_GTM_WORKFLOW_TRANSITIONS,
  OPEN_GTM_WORKFLOW_RUN_STATUSES,
  OPEN_GTM_WORKFLOW_RUN_TRANSITIONS,
  type OpenGtmLane,
  type OpenGtmWorkflowStatus,
  type OpenGtmWorkflowRunStatus
} from '@opengtm/types'

export function createWorkflow(input: OpenGtmWorkflowInput): OpenGtmWorkflow {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    name: input.name,
    description: input.description || '',
    trigger: input.trigger || 'manual',
    lane: (input.lane as OpenGtmLane) || 'research',
    status: (input.status as OpenGtmWorkflowStatus) || 'draft'
  }
}

export function transitionWorkflow(wf: OpenGtmWorkflow, newStatus: OpenGtmWorkflowStatus): OpenGtmWorkflow {
  const allowed = OPEN_GTM_WORKFLOW_TRANSITIONS[wf.status]
  assertOneOf(newStatus, allowed, 'workflow transition')
  return { ...wf, status: newStatus }
}

export function createWorkflowRun(input: OpenGtmWorkflowRunInput): OpenGtmWorkflowRun {
  const base = createEntityBase(input)
  return {
    ...base,
    workflowId: input.workflowId,
    status: (input.status as OpenGtmWorkflowRunStatus) || 'running',
    input: input.input || {},
    output: input.output || {},
    error: input.error || null
  }
}

export function transitionWorkflowRun(run: OpenGtmWorkflowRun, newStatus: OpenGtmWorkflowRunStatus): OpenGtmWorkflowRun {
  const allowed = OPEN_GTM_WORKFLOW_RUN_TRANSITIONS[run.status]
  assertOneOf(newStatus, allowed, 'workflow run transition')
  return { ...run, status: newStatus }
}