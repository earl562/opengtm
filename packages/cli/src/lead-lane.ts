export type OpenGtmLeadLanePhase =
  | 'researching'
  | 'draft-ready'
  | 'approval-gated'
  | 'follow-through'
  | 'preflight-hold'
  | 'sequence-ready'

export interface OpenGtmLeadLaneState {
  phase: OpenGtmLeadLanePhase | null
  relationshipState: string | null
  doNotSend: boolean | null
  recommendedApproach: string | null
  lastOutreachSummary: string | null
  updatedAt: string | null
}

export interface OpenGtmLeadRuntimeSummary {
  phase?: string | null
  relationshipState?: string | null
  doNotSend?: string | null
  recommendedApproach?: string | null
}

export interface OpenGtmLeadLaneTransitionEvent {
  workflowId?: string | null
  traceStatus?: string | null
  approvalStatus?: string | null
  approvalRequested?: boolean
  action?: string | null
  focusEntity?: string | null
}

export interface OpenGtmLeadLanePhaseState {
  id: OpenGtmLeadLanePhase | null
  label: string
  nextAction: string
}

export function createEmptyLeadLaneState(): OpenGtmLeadLaneState {
  return {
    phase: null,
    relationshipState: null,
    doNotSend: null,
    recommendedApproach: null,
    lastOutreachSummary: null,
    updatedAt: null
  }
}

export function normalizeLeadLaneState(
  leadLane: OpenGtmLeadLaneState | null | undefined
): OpenGtmLeadLaneState {
  return {
    ...createEmptyLeadLaneState(),
    ...(leadLane || {}),
    phase: normalizeLeadLanePhase(leadLane?.phase),
    doNotSend: normalizeLeadLaneDoNotSend(leadLane?.doNotSend)
  }
}

export function deriveLeadLaneStateFromRuntime(
  leadRuntime: OpenGtmLeadRuntimeSummary | null | undefined
): OpenGtmLeadLaneState {
  return {
    phase: normalizeLeadLanePhase(leadRuntime?.phase),
    relationshipState: leadRuntime?.relationshipState || null,
    doNotSend: normalizeLeadLaneDoNotSend(leadRuntime?.doNotSend),
    recommendedApproach: leadRuntime?.recommendedApproach || null,
    lastOutreachSummary: null,
    updatedAt: new Date().toISOString()
  }
}

export function deriveLeadLaneStateFromSummary(summary: string[]): OpenGtmLeadLaneState {
  const phase = summary.find((line) => line.startsWith('Lead phase:'))?.replace(/^Lead phase:\s*/, '') || null
  const relationshipState = summary.find((line) => line.startsWith('Relationship state:'))?.replace(/^Relationship state:\s*/, '') || null
  const doNotSend = summary.find((line) => line.startsWith('Do-not-send:'))?.replace(/^Do-not-send:\s*/, '') || null
  const recommendedApproach = summary.find((line) => line.startsWith('Recommended approach:'))?.replace(/^Recommended approach:\s*/, '') || null
  const lastOutreachSummary = summary.find((line) => line.startsWith('Latest outreach:'))?.replace(/^Latest outreach:\s*/, '') || null
  return {
    phase: normalizeLeadLanePhase(phase),
    relationshipState,
    doNotSend: normalizeLeadLaneDoNotSend(doNotSend),
    recommendedApproach,
    lastOutreachSummary,
    updatedAt: new Date().toISOString()
  }
}

export function transitionLeadLaneState(
  current: OpenGtmLeadLaneState | null | undefined,
  event: OpenGtmLeadLaneTransitionEvent
): OpenGtmLeadLaneState {
  const state = normalizeLeadLaneState(current)
  const workflowId = event.workflowId || null
  const traceStatus = event.traceStatus || null
  const approvalStatus = event.approvalStatus || null
  const approvalAction = event.action || null

  if (!workflowId) {
    return state
  }

  if (workflowId === 'sdr.lead_research' && traceStatus === 'completed') {
    return {
      ...state,
      phase: 'draft-ready',
      doNotSend: state.doNotSend ?? false,
      updatedAt: new Date().toISOString()
    }
  }

  if (workflowId === 'sdr.outreach_compose') {
    if (approvalStatus === 'pending' || event.approvalRequested || traceStatus === 'awaiting-approval') {
      return {
        ...state,
        phase: 'approval-gated',
        updatedAt: new Date().toISOString()
      }
    }

    if (approvalStatus === 'approved' || approvalAction === 'approve' || traceStatus === 'completed') {
      return {
        ...state,
        phase: 'follow-through',
        doNotSend: true,
        lastOutreachSummary:
          state.lastOutreachSummary
          || `Approved outreach draft for ${event.focusEntity || 'lead'}`,
        updatedAt: new Date().toISOString()
      }
    }
  }

  if (workflowId === 'sdr.outreach_sequence') {
    if (approvalStatus === 'pending' || event.approvalRequested || traceStatus === 'awaiting-approval') {
      return {
        ...state,
        phase: 'approval-gated',
        updatedAt: new Date().toISOString()
      }
    }

    if (approvalStatus === 'approved' || approvalAction === 'approve' || traceStatus === 'completed') {
      return {
        ...state,
        phase: 'sequence-ready',
        updatedAt: new Date().toISOString()
      }
    }
  }

  if (approvalAction === 'deny' && (workflowId === 'sdr.outreach_compose' || workflowId === 'sdr.outreach_sequence')) {
    return {
      ...state,
      phase: 'preflight-hold',
      updatedAt: new Date().toISOString()
    }
  }

  return state
}

export function summarizeLeadRuntime(summary: string[]) {
  const phase = summary.find((line) => line.startsWith('Lead phase:'))?.replace(/^Lead phase:\s*/, '') || null
  const relationshipState = summary.find((line) => line.startsWith('Relationship state:'))?.replace(/^Relationship state:\s*/, '') || null
  const doNotSend = summary.find((line) => line.startsWith('Do-not-send:'))?.replace(/^Do-not-send:\s*/, '') || null
  const recommendedApproach = summary.find((line) => line.startsWith('Recommended approach:'))?.replace(/^Recommended approach:\s*/, '') || null
  if (!phase && !relationshipState && !doNotSend && !recommendedApproach) {
    return null
  }
  return {
    phase,
    relationshipState,
    doNotSend,
    recommendedApproach
  }
}

export function deriveLeadLanePhaseState(args: {
  lastWorkflowId: string | null
  traceStatus: string | null
  relationshipState?: string | null
  doNotSend?: boolean
}) : OpenGtmLeadLanePhaseState {
  if (args.traceStatus === 'awaiting-approval') {
    return {
      id: 'approval-gated',
      label: 'approval-gated',
      nextAction: 'Lead phase: approval-gated. Review the draft rationale and resolve the approval gate before the runtime continues.'
    }
  }

  if (args.doNotSend && args.lastWorkflowId === 'sdr.outreach_compose') {
    return {
      id: 'follow-through',
      label: 'follow-through',
      nextAction: 'Lead phase: follow-through. Recent outbound activity already exists in CRM evidence, so avoid another first-touch send and continue with sequenced follow-up or inspect recent outreach evidence.'
    }
  }

  if (args.doNotSend) {
    return {
      id: 'preflight-hold',
      label: 'preflight-hold',
      nextAction: 'Lead phase: preflight-hold. Resolve the recent-outreach hold before drafting another outbound send.'
    }
  }

  if (args.lastWorkflowId === 'sdr.outreach_sequence') {
    return {
      id: 'sequence-ready',
      label: 'sequence-ready',
      nextAction: 'Lead phase: sequence-ready. Review the follow-up plan and decide whether to continue the sequence or refresh context.'
    }
  }

  if (args.relationshipState) {
    return {
      id: 'draft-ready',
      label: 'draft-ready',
      nextAction: `Lead phase: draft-ready. Draft the next ${args.relationshipState.replace(/-/g, ' ')} outreach touch.`
    }
  }

  return {
    id: 'researching',
    label: 'researching',
    nextAction: 'Lead phase: researching. Gather more context before drafting outbound.'
  }
}

export function toLeadRuntimeSummary(leadLane: OpenGtmLeadLaneState | null | undefined) {
  const state = normalizeLeadLaneState(leadLane)
  if (!state.phase) return null
  return {
    phase: state.phase,
    relationshipState: state.relationshipState,
    doNotSend:
      state.doNotSend === null
        ? null
        : state.doNotSend
          ? 'hold current send'
          : 'clear to draft',
    recommendedApproach: state.recommendedApproach
  }
}

function normalizeLeadLanePhase(phase: string | null | undefined): OpenGtmLeadLanePhase | null {
  if (
    phase === 'researching'
    || phase === 'draft-ready'
    || phase === 'approval-gated'
    || phase === 'follow-through'
    || phase === 'preflight-hold'
    || phase === 'sequence-ready'
  ) {
    return phase
  }
  return null
}

function normalizeLeadLaneDoNotSend(doNotSend: string | boolean | null | undefined) {
  if (typeof doNotSend === 'boolean') return doNotSend
  if (typeof doNotSend !== 'string') return null
  if (doNotSend.includes('hold')) return true
  if (doNotSend.includes('clear')) return false
  return null
}
