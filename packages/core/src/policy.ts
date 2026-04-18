import { createEntityBase } from './utils.js'
import type { OpenGtmPolicyDecision, OpenGtmPolicyDecisionInput, OpenGtmApprovalRequest, OpenGtmApprovalRequestInput } from '@opengtm/types'
import {
  OPEN_GTM_LANES,
  OPEN_GTM_ACTION_TYPES,
  OPEN_GTM_RISK_LEVELS,
  OPEN_GTM_APPROVAL_STATUSES,
  OPEN_GTM_APPROVAL_TRANSITIONS,
  OPEN_GTM_LANE_POLICIES,
  type OpenGtmLane,
  type OpenGtmActionType,
  type OpenGtmRiskLevel,
  type OpenGtmApprovalStatus
} from '@opengtm/types'

export function createPolicyDecision(input: OpenGtmPolicyDecisionInput): OpenGtmPolicyDecision {
  const base = createEntityBase(input)
  return {
    ...base,
    workItemId: input.workItemId,
    lane: input.lane as OpenGtmLane,
    actionType: input.actionType as OpenGtmActionType,
    connectorFamily: input.connectorFamily || null,
    target: input.target || '',
    riskLevel: (input.riskLevel as OpenGtmRiskLevel) || 'low',
    decision: input.decision,
    approvalRequired: input.approvalRequired,
    reason: input.reason
  }
}

export function createApprovalRequest(input: OpenGtmApprovalRequestInput): OpenGtmApprovalRequest {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    lane: input.lane as OpenGtmLane,
    actionSummary: input.actionSummary,
    riskLevel: input.riskLevel as OpenGtmRiskLevel,
    target: input.target,
    status: (input.status as OpenGtmApprovalStatus) || 'pending',
    decisionRef: input.decisionRef || null
  }
}

export function transitionApprovalRequest(req: OpenGtmApprovalRequest, newStatus: OpenGtmApprovalStatus): OpenGtmApprovalRequest {
  const allowed = OPEN_GTM_APPROVAL_TRANSITIONS[req.status]
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid OpenGTM approval transition from ${req.status} to ${newStatus}`)
  }
  return { ...req, status: newStatus }
}

export function requiresExplicitApproval(actionType: OpenGtmActionType, lane: OpenGtmLane): boolean {
  const policy = OPEN_GTM_LANE_POLICIES[lane]
  return policy.externalMutationRequiresApproval || policy.repoMutationRequiresApproval
}

export function supportsConnectorFamily(lane: OpenGtmLane, family: string): boolean {
  const policy = OPEN_GTM_LANE_POLICIES[lane]
  return policy.connectorFamilies.includes(family as never)
}

export function getLanePolicy(lane: OpenGtmLane) {
  return OPEN_GTM_LANE_POLICIES[lane]
}