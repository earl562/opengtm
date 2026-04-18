import { createEntityBase } from './utils.js'
import { assertOneOf } from './utils.js'
import type { OpenGtmWorkItem, OpenGtmWorkItemInput } from '@opengtm/types'
import {
  OPEN_GTM_WORK_ITEM_STATUSES,
  OPEN_GTM_WORK_ITEM_TRANSITIONS,
  OPEN_GTM_RISK_LEVELS,
  OPEN_GTM_LANES,
  type OpenGtmWorkItemStatus,
  type OpenGtmRiskLevel,
  type OpenGtmLane
} from '@opengtm/types'

export function createWorkItem(input: OpenGtmWorkItemInput): OpenGtmWorkItem {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    initiativeId: input.initiativeId,
    workflowId: input.workflowId || null,
    workflowRunId: input.workflowRunId || null,
    journeyId: input.journeyId || null,
    ownerLane: input.ownerLane as OpenGtmLane,
    title: input.title,
    goal: input.goal,
    status: (input.status as OpenGtmWorkItemStatus) || 'queued',
    riskLevel: (input.riskLevel as OpenGtmRiskLevel) || 'low',
    leaseOwner: input.leaseOwner || null,
    leaseExpiresAt: input.leaseExpiresAt ? new Date(input.leaseExpiresAt).toISOString() : null,
    constraints: input.constraints || [],
    requiredOutputs: input.requiredOutputs || [],
    sourceIds: input.sourceIds || [],
    connectorTargets: input.connectorTargets || []
  }
}

export function transitionWorkItem(item: OpenGtmWorkItem, newStatus: OpenGtmWorkItemStatus): OpenGtmWorkItem {
  const allowed = OPEN_GTM_WORK_ITEM_TRANSITIONS[item.status]
  assertOneOf(newStatus, allowed, 'work item transition')
  return {
    ...item,
    status: newStatus
  }
}