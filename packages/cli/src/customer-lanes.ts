export type OpenGtmAccountLanePhase =
  | 'health-assessed'
  | 'renewal-ready'
  | 'expansion-ready'
  | 'brief-ready'
  | 'deal-branch-ready'
  | 'approval-gated'

export type OpenGtmDealLanePhase =
  | 'risk-assessed'
  | 'brief-ready'
  | 'approval-gated'

export interface OpenGtmAccountLaneState {
  phase: OpenGtmAccountLanePhase | null
  healthScore: number | null
  updatedAt: string | null
}

export interface OpenGtmDealLaneState {
  phase: OpenGtmDealLanePhase | null
  riskScore: number | null
  updatedAt: string | null
}

export interface OpenGtmCustomerLaneSummary {
  phase?: string | null
  nextAction: string
}

export interface OpenGtmCustomerRuntimeSummary {
  phase?: string | null
}

export interface OpenGtmAccountLaneTransitionEvent {
  workflowId?: string | null
  traceStatus?: string | null
  healthScore?: number | null
}

export interface OpenGtmDealLaneTransitionEvent {
  workflowId?: string | null
  traceStatus?: string | null
  riskScore?: number | null
}

export function createEmptyAccountLaneState(): OpenGtmAccountLaneState {
  return {
    phase: null,
    healthScore: null,
    updatedAt: null
  }
}

export function createEmptyDealLaneState(): OpenGtmDealLaneState {
  return {
    phase: null,
    riskScore: null,
    updatedAt: null
  }
}

export function normalizeAccountLaneState(
  accountLane: OpenGtmAccountLaneState | null | undefined
): OpenGtmAccountLaneState {
  return {
    ...createEmptyAccountLaneState(),
    ...(accountLane || {}),
    phase: normalizeAccountLanePhase(accountLane?.phase),
    healthScore: Number.isFinite(accountLane?.healthScore) ? Number(accountLane?.healthScore) : null
  }
}

export function normalizeDealLaneState(
  dealLane: OpenGtmDealLaneState | null | undefined
): OpenGtmDealLaneState {
  return {
    ...createEmptyDealLaneState(),
    ...(dealLane || {}),
    phase: normalizeDealLanePhase(dealLane?.phase),
    riskScore: Number.isFinite(dealLane?.riskScore) ? Number(dealLane?.riskScore) : null
  }
}

export function deriveAccountLanePhaseState(args: {
  lastWorkflowId: string | null
  traceStatus: string | null
  healthScore: number
}): OpenGtmCustomerLaneSummary {
  if (args.traceStatus === 'awaiting-approval') {
    return {
      phase: 'approval-gated',
      nextAction: 'Account phase: approval-gated. Resolve the current approval before the account motion continues.'
    }
  }

  if (args.lastWorkflowId === 'ae.account_brief') {
    return {
      phase: 'deal-branch-ready',
      nextAction: 'Account phase: deal-branch-ready. Decide whether to branch the account motion into deal risk or refresh account health.'
    }
  }

  if (args.lastWorkflowId === 'cs.renewal_prep') {
    return {
      phase: 'brief-ready',
      nextAction: 'Account phase: brief-ready. Turn the renewal motion into an AE-ready account brief or inspect the latest dossier.'
    }
  }

  if (args.lastWorkflowId === 'ae.expansion_signal') {
    return {
      phase: 'brief-ready',
      nextAction: 'Account phase: brief-ready. Convert the expansion signal into an account brief or branch to deal risk.'
    }
  }

  if (args.healthScore >= 75) {
    return {
      phase: 'expansion-ready',
      nextAction: 'Account phase: expansion-ready. Follow the healthy account signal into an expansion motion.'
    }
  }

  return {
    phase: 'renewal-ready',
    nextAction: 'Account phase: renewal-ready. Prepare the renewal motion or inspect the account dossier before acting.'
  }
}

export function deriveDealLanePhaseState(args: {
  lastWorkflowId: string | null
  traceStatus: string | null
}): OpenGtmCustomerLaneSummary {
  if (args.traceStatus === 'awaiting-approval') {
    return {
      phase: 'approval-gated',
      nextAction: 'Deal phase: approval-gated. Resolve the current approval before the deal motion continues.'
    }
  }

  if (args.lastWorkflowId === 'ae.account_brief') {
    return {
      phase: 'brief-ready',
      nextAction: 'Deal phase: brief-ready. Review the AE-ready brief and decide whether to re-check deal risk or hold.'
    }
  }

  return {
    phase: 'risk-assessed',
    nextAction: 'Deal phase: risk-assessed. Review the latest risk signals and decide whether to brief or keep monitoring.'
  }
}

export function deriveAccountLaneStateFromSummary(summary: string[]): OpenGtmAccountLaneState {
  const phase = summary.find((line) => line.startsWith('Account phase:'))?.replace(/^Account phase:\s*/, '') || null
  const healthScoreLine = summary.find((line) => line.startsWith('Health score:')) || null
  const healthScore = healthScoreLine
    ? Number(String(healthScoreLine.replace(/^Health score:\s*/, '')).split(/\s+/)[0])
    : null
  return {
    phase: normalizeAccountLanePhase(phase),
    healthScore: Number.isFinite(healthScore) ? healthScore : null,
    updatedAt: new Date().toISOString()
  }
}

export function deriveDealLaneStateFromSummary(summary: string[]): OpenGtmDealLaneState {
  const phase = summary.find((line) => line.startsWith('Deal phase:'))?.replace(/^Deal phase:\s*/, '') || null
  const riskScoreLine = summary.find((line) => line.startsWith('Risk score:')) || null
  const riskScore = riskScoreLine
    ? Number(String(riskScoreLine.replace(/^Risk score:\s*/, '')).split(/\s+/)[0])
    : null
  return {
    phase: normalizeDealLanePhase(phase),
    riskScore: Number.isFinite(riskScore) ? riskScore : null,
    updatedAt: new Date().toISOString()
  }
}

export function deriveAccountLaneStateFromRuntime(
  accountRuntime: OpenGtmCustomerRuntimeSummary | null | undefined
): OpenGtmAccountLaneState {
  return {
    phase: normalizeAccountLanePhase(accountRuntime?.phase),
    healthScore: null,
    updatedAt: new Date().toISOString()
  }
}

export function deriveDealLaneStateFromRuntime(
  dealRuntime: OpenGtmCustomerRuntimeSummary | null | undefined
): OpenGtmDealLaneState {
  return {
    phase: normalizeDealLanePhase(dealRuntime?.phase),
    riskScore: null,
    updatedAt: new Date().toISOString()
  }
}

export function transitionAccountLaneState(
  current: OpenGtmAccountLaneState | null | undefined,
  event: OpenGtmAccountLaneTransitionEvent
): OpenGtmAccountLaneState {
  const state = normalizeAccountLaneState(current)
  const workflowId = event.workflowId || null
  const traceStatus = event.traceStatus || null

  if (!workflowId) return state

  if (traceStatus === 'awaiting-approval') {
    return {
      ...state,
      phase: 'approval-gated',
      updatedAt: new Date().toISOString()
    }
  }

  if (workflowId === 'cs.health_score') {
    return {
      ...state,
      phase: deriveAccountLanePhaseState({
        lastWorkflowId: workflowId,
        traceStatus,
        healthScore: Number.isFinite(event.healthScore) ? Number(event.healthScore) : state.healthScore || 0
      }).phase as OpenGtmAccountLanePhase,
      healthScore: Number.isFinite(event.healthScore) ? Number(event.healthScore) : state.healthScore,
      updatedAt: new Date().toISOString()
    }
  }

  if (workflowId === 'cs.renewal_prep') {
    return {
      ...state,
      phase: 'brief-ready',
      updatedAt: new Date().toISOString()
    }
  }

  if (workflowId === 'ae.expansion_signal') {
    return {
      ...state,
      phase: 'brief-ready',
      updatedAt: new Date().toISOString()
    }
  }

  if (workflowId === 'ae.account_brief') {
    return {
      ...state,
      phase: 'deal-branch-ready',
      updatedAt: new Date().toISOString()
    }
  }

  return state
}

export function transitionDealLaneState(
  current: OpenGtmDealLaneState | null | undefined,
  event: OpenGtmDealLaneTransitionEvent
): OpenGtmDealLaneState {
  const state = normalizeDealLaneState(current)
  const workflowId = event.workflowId || null
  const traceStatus = event.traceStatus || null

  if (!workflowId) return state

  if (traceStatus === 'awaiting-approval') {
    return {
      ...state,
      phase: 'approval-gated',
      updatedAt: new Date().toISOString()
    }
  }

  if (workflowId === 'ae.deal_risk_scan') {
    return {
      ...state,
      phase: 'risk-assessed',
      riskScore: Number.isFinite(event.riskScore) ? Number(event.riskScore) : state.riskScore,
      updatedAt: new Date().toISOString()
    }
  }

  if (workflowId === 'ae.account_brief') {
    return {
      ...state,
      phase: 'brief-ready',
      updatedAt: new Date().toISOString()
    }
  }

  return state
}

export function summarizeAccountRuntime(summary: string[]) {
  const phase = summary.find((line) => line.startsWith('Account phase:'))?.replace(/^Account phase:\s*/, '') || null
  if (!phase) return null
  return { phase }
}

export function summarizeDealRuntime(summary: string[]) {
  const phase = summary.find((line) => line.startsWith('Deal phase:'))?.replace(/^Deal phase:\s*/, '') || null
  if (!phase) return null
  return { phase }
}

export function toAccountRuntimeSummary(accountLane: OpenGtmAccountLaneState | null | undefined) {
  const state = normalizeAccountLaneState(accountLane)
  if (!state.phase) return null
  return { phase: state.phase }
}

export function toDealRuntimeSummary(dealLane: OpenGtmDealLaneState | null | undefined) {
  const state = normalizeDealLaneState(dealLane)
  if (!state.phase) return null
  return { phase: state.phase }
}

function normalizeAccountLanePhase(phase: string | null | undefined): OpenGtmAccountLanePhase | null {
  if (
    phase === 'health-assessed'
    || phase === 'renewal-ready'
    || phase === 'expansion-ready'
    || phase === 'brief-ready'
    || phase === 'deal-branch-ready'
    || phase === 'approval-gated'
  ) {
    return phase
  }
  return null
}

function normalizeDealLanePhase(phase: string | null | undefined): OpenGtmDealLanePhase | null {
  if (
    phase === 'risk-assessed'
    || phase === 'brief-ready'
    || phase === 'approval-gated'
  ) {
    return phase
  }
  return null
}
