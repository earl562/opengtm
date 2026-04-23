import { describe, expect, it } from 'vitest'
import {
  deriveAccountLanePhaseState,
  deriveDealLanePhaseState,
  summarizeAccountRuntime,
  summarizeDealRuntime
} from '../src/customer-lanes.js'

describe('customer lane summaries', () => {
  it('derives account lane phases from workflow and health', () => {
    expect(deriveAccountLanePhaseState({
      lastWorkflowId: 'cs.health_score',
      traceStatus: 'completed',
      healthScore: 82
    })).toEqual({
      phase: 'expansion-ready',
      nextAction: 'Account phase: expansion-ready. Follow the healthy account signal into an expansion motion.'
    })

    expect(deriveAccountLanePhaseState({
      lastWorkflowId: 'cs.renewal_prep',
      traceStatus: 'completed',
      healthScore: 61
    }).phase).toBe('brief-ready')
  })

  it('derives deal lane phases from workflow state', () => {
    expect(deriveDealLanePhaseState({
      lastWorkflowId: 'ae.deal_risk_scan',
      traceStatus: 'completed'
    })).toEqual({
      phase: 'risk-assessed',
      nextAction: 'Deal phase: risk-assessed. Review the latest risk signals and decide whether to brief or keep monitoring.'
    })

    expect(deriveDealLanePhaseState({
      lastWorkflowId: 'ae.account_brief',
      traceStatus: 'completed'
    }).phase).toBe('brief-ready')
  })

  it('summarizes account and deal runtime strings from query output', () => {
    expect(summarizeAccountRuntime([
      'Current account motion: Acme',
      'Account phase: renewal-ready',
      'Health score: 66'
    ])).toEqual({ phase: 'renewal-ready' })

    expect(summarizeDealRuntime([
      'Current deal motion: Acme Renewal',
      'Deal phase: risk-assessed',
      'Risk score: 48'
    ])).toEqual({ phase: 'risk-assessed' })
  })
})
