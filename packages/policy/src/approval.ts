import { createPolicyDecision, createApprovalRequest, requiresExplicitApproval } from '@opengtm/core'
import { classifyRiskLevel } from './risk.js'
import {
  OPEN_GTM_ACTION_TYPES,
  OPEN_GTM_LANES,
  type OpenGtmActionType,
  type OpenGtmApprovalRequest,
  type OpenGtmLane,
  type OpenGtmPolicyDecision
} from '@opengtm/types'
import type { OpenGtmPolicyConfig } from './config.js'

const APPROVAL_GATED_ACTIONS = new Set<OpenGtmActionType>([
  'write-repo',
  'mutate-connector',
  'send-message',
  'browser-act'
])

function toOpenGtmActionType(actionType: string): OpenGtmActionType | null {
  return OPEN_GTM_ACTION_TYPES.find((value): value is OpenGtmActionType => value === actionType) ?? null
}

function toOpenGtmLane(lane: string): OpenGtmLane | null {
  return OPEN_GTM_LANES.find((value): value is OpenGtmLane => value === lane) ?? null
}

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
  const normalizedActionType = toOpenGtmActionType(actionType)
  const normalizedLane = toOpenGtmLane(lane)
  const approvalRequired = normalizedActionType && normalizedLane
    ? APPROVAL_GATED_ACTIONS.has(normalizedActionType) && requiresExplicitApproval(normalizedActionType, normalizedLane)
    : false

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

export function createPolicyDecisionFromActionWithConfig(
  input: {
    workItemId: string
    lane: string
    actionType: string
    connectorFamily?: string | null
    target?: string
  },
  config: OpenGtmPolicyConfig
): OpenGtmPolicyDecision {
  const base = createPolicyDecisionFromAction(input)
  const require = config.requireApprovalForActions.includes(input.actionType)
  const escalate = config.escalateForActions.includes(input.actionType)

  if (require || escalate) {
    return {
      ...base,
      approvalRequired: true,
      decision: 'require-approval',
      reason: `Policy config v${config.version}: action ${input.actionType} requires escalation/approval.`
    }
  }

  return base
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
