import { describe, expect, it } from 'vitest'
import { createMockProvider } from '@opengtm/providers'

import { runAblationSuite } from '../src/ablations.js'

describe('evals: ablations', () => {
  it('returns 8 results with deterministic ordering', async () => {
    const provider = createMockProvider({ seed: 'ablations' })
    const suite = await runAblationSuite({ goal: 'test goal', provider, limits: { maxSteps: 3 } })

    expect(suite.results).toHaveLength(8)
    expect(suite.baselineToggleSet).toEqual({ memoryRetrieval: true, skillLoading: true, policyGating: true })

    const ordered = suite.results.map((r) => r.toggleSet)
    expect(ordered).toEqual([
      { memoryRetrieval: true, skillLoading: true, policyGating: true },
      { memoryRetrieval: true, skillLoading: true, policyGating: false },
      { memoryRetrieval: true, skillLoading: false, policyGating: true },
      { memoryRetrieval: true, skillLoading: false, policyGating: false },
      { memoryRetrieval: false, skillLoading: true, policyGating: true },
      { memoryRetrieval: false, skillLoading: true, policyGating: false },
      { memoryRetrieval: false, skillLoading: false, policyGating: true },
      { memoryRetrieval: false, skillLoading: false, policyGating: false }
    ])
  })

  it('sets baseline delta to 0 and policyGating=false yields negative delta', async () => {
    const provider = createMockProvider({ seed: 'ablations' })
    const suite = await runAblationSuite({ goal: 'test goal', provider, limits: { maxSteps: 3 } })

    const baseline = suite.results.find(
      (r) => r.toggleSet.memoryRetrieval && r.toggleSet.skillLoading && r.toggleSet.policyGating
    )
    expect(baseline).toBeTruthy()
    expect(baseline!.deltaTotalScore).toBe(0)
    expect(suite.baselineScore.totalScore).toBe(baseline!.scorecard.totalScore)

    const hasNegativeWhenPolicyOff = suite.results.some(
      (r) => r.toggleSet.policyGating === false && r.deltaTotalScore < 0
    )
    expect(hasNegativeWhenPolicyOff).toBe(true)
  })

  it('uses runtime toggles to change real loop behavior', async () => {
    const provider = createMockProvider({ seed: 'ablations-runtime' })
    const suite = await runAblationSuite({ goal: 'research this lead for Acme', provider, limits: { maxSteps: 3 } })

    const baseline = suite.results.find(
      (r) => r.toggleSet.memoryRetrieval && r.toggleSet.skillLoading && r.toggleSet.policyGating
    )
    const memoryOff = suite.results.find(
      (r) => !r.toggleSet.memoryRetrieval && r.toggleSet.skillLoading && r.toggleSet.policyGating
    )
    const skillsOff = suite.results.find(
      (r) => r.toggleSet.memoryRetrieval && !r.toggleSet.skillLoading && r.toggleSet.policyGating
    )
    const policyOff = suite.results.find(
      (r) => r.toggleSet.memoryRetrieval && r.toggleSet.skillLoading && !r.toggleSet.policyGating
    )

    expect(baseline).toBeTruthy()
    expect(memoryOff).toBeTruthy()
    expect(skillsOff).toBeTruthy()
    expect(policyOff).toBeTruthy()

    expect(baseline!.loopResult.steps.some((step) => (step.memoryHits?.length ?? 0) > 0)).toBe(true)
    expect(memoryOff!.loopResult.steps.every((step) => (step.memoryHits?.length ?? 0) === 0)).toBe(true)

    expect(baseline!.loopResult.steps.some((step) => (step.disclosedSkills?.length ?? 0) > 0)).toBe(true)
    expect(skillsOff!.loopResult.steps.every((step) => (step.disclosedSkills?.length ?? 0) === 0)).toBe(true)

    expect(baseline!.loopResult.steps[2]?.connectorStatus).toBe('skipped-approval')
    expect(baseline!.loopResult.steps[2]?.approvalRequest?.status).toBe('pending')
    expect(policyOff!.loopResult.steps[2]?.connectorStatus).toBe('executed')
    expect(policyOff!.loopResult.steps[2]?.policyDecision).toBeUndefined()
    expect(policyOff!.metrics.failedCount).toBeGreaterThan(baseline!.metrics.failedCount)
    expect(policyOff!.metrics.approvalRate).toBeLessThan(baseline!.metrics.approvalRate)
  })
})
