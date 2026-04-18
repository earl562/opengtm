import { createPolicyDecision, createApprovalRequest, requiresExplicitApproval } from '@opengtm/core'
import { classifyRiskLevel } from './risk.js'
import { OPEN_GTM_POLICY_PROFILES } from './profiles.js'
import type { OpenGtmPolicyDecision, OpenGtmApprovalRequest } from '@opengtm/types'

export function createPolicyDecisionFromAction({
  workItemId,
  lane,
  actionType,
  connectorFamily = null,
  target = ''
}: {
  workItemId: string
  lane: string
  actionType: string
  connectorFamily?: string | null
  target?: string
}): OpenGtmPolicyDecision {
  const riskLevel = classifyRiskLevel({ lane, actionType, connectorFamily })
  const approvalRequired = requiresExplicitApproval(actionType as any, lane as any)

  return createPolicyDecision({
    workItemId,
    lane,
    actionType,
    connectorFamily,
    target,
    decision: approvalRequired ? 'require-approval' : 'allow',
    approvalRequired,
    reason: approvalRequired
      ? `Action ${actionType} on ${connectorFamily || 'local-runtime'} is approval-gated for the ${lane} lane.`
      : `Action ${actionType} is safe to auto-run in the ${lane} lane.`,
    riskLevel
  })
}

export function requiresHumanApproval(decision: { approvalRequired?: boolean }): boolean {
  return Boolean(decision.approvalRequired)
}

export function previewPolicyDecision({
  workItemId = 'preview',
  lane,
  actionType,
  connectorFamily = null,
  target = '',
  policyProfile = 'balanced'
}: {
  workItemId?: string
  lane: string
  actionType: string
  connectorFamily?: string | null
  target?: string
  policyProfile?: string
}): OpenGtmPolicyDecision & { policyProfile: string } {
  const decision = createPolicyDecisionFromAction({
    workItemId,
    lane,
    actionType,
    connectorFamily,
    target
  })

  return {
    policyProfile,
    ...decision
  }
}

export function createApprovalRequestForDecision({
  workspaceId,
  decision,
  actionSummary
}: {
  workspaceId: string
  decision: { workItemId: string; lane: string; riskLevel?: string; target: string; id: string }
  actionSummary: string
}): OpenGtmApprovalRequest {
  return createApprovalRequest({
    workspaceId,
    workItemId: decision.workItemId,
    lane: decision.lane,
    actionSummary,
    riskLevel: decision.riskLevel || 'medium',
    target: decision.target,
    decisionRef: decision.id
  })
}
