import { describe, expect, it } from 'vitest'
import {
  createEmptyLeadLaneState,
  deriveLeadLanePhaseState,
  deriveLeadLaneStateFromSummary,
  summarizeLeadRuntime,
  toLeadRuntimeSummary,
  transitionLeadLaneState
} from '../src/lead-lane.js'

describe('lead lane state machine', () => {
  it('derives lane state from summary lines', () => {
    const state = deriveLeadLaneStateFromSummary([
      'Current lead motion: Acme',
      'Lead phase: draft-ready',
      'Relationship state: warm-prospect',
      'Do-not-send: clear to draft',
      'Recommended approach: Continue the warm thread.'
    ])

    expect(state.phase).toBe('draft-ready')
    expect(state.relationshipState).toBe('warm-prospect')
    expect(state.doNotSend).toBe(false)
    expect(state.recommendedApproach).toContain('warm thread')
  })

  it('transitions lead research into draft-ready and outreach approval into follow-through', () => {
    const afterResearch = transitionLeadLaneState(createEmptyLeadLaneState(), {
      workflowId: 'sdr.lead_research',
      traceStatus: 'completed',
      focusEntity: 'Acme'
    })
    expect(afterResearch.phase).toBe('draft-ready')
    expect(afterResearch.doNotSend).toBe(false)

    const afterApproval = transitionLeadLaneState(afterResearch, {
      workflowId: 'sdr.outreach_compose',
      approvalStatus: 'approved',
      action: 'approve',
      focusEntity: 'Acme'
    })
    expect(afterApproval.phase).toBe('follow-through')
    expect(afterApproval.doNotSend).toBe(true)
    expect(afterApproval.lastOutreachSummary).toContain('Approved outreach draft')
  })

  it('summarizes persisted lane state back into runtime-friendly fields', () => {
    const state = {
      ...createEmptyLeadLaneState(),
      phase: 'follow-through' as const,
      relationshipState: 'warm-prospect',
      doNotSend: true,
      recommendedApproach: 'Continue with follow-through.'
    }

    expect(toLeadRuntimeSummary(state)).toEqual({
      phase: 'follow-through',
      relationshipState: 'warm-prospect',
      doNotSend: 'hold current send',
      recommendedApproach: 'Continue with follow-through.'
    })

    expect(summarizeLeadRuntime([
      'Lead phase: follow-through',
      'Relationship state: warm-prospect',
      'Do-not-send: hold current send',
      'Recommended approach: Continue with follow-through.'
    ])).toEqual({
      phase: 'follow-through',
      relationshipState: 'warm-prospect',
      doNotSend: 'hold current send',
      recommendedApproach: 'Continue with follow-through.'
    })
  })

  it('derives phase labels and next actions from lane context', () => {
    expect(deriveLeadLanePhaseState({
      lastWorkflowId: 'sdr.lead_research',
      traceStatus: 'completed',
      relationshipState: 'warm-prospect',
      doNotSend: false
    })).toEqual({
      id: 'draft-ready',
      label: 'draft-ready',
      nextAction: 'Lead phase: draft-ready. Draft the next warm prospect outreach touch.'
    })

    expect(deriveLeadLanePhaseState({
      lastWorkflowId: 'sdr.outreach_compose',
      traceStatus: 'completed',
      relationshipState: 'warm-prospect',
      doNotSend: true
    }).id).toBe('follow-through')
  })
})
