import { describe, expect, it } from 'vitest'

import { runIntegratedRuntimeSmokeHarness } from '../src/runtime-smoke.js'

describe('evals: integrated runtime smoke harness', () => {
  it('covers safe reads, approval-gated writes, and context budget trimming', async () => {
    const results = await runIntegratedRuntimeSmokeHarness()

    const safeRead = results.find((result) => result.name === 'safe-read-executes')
    const gatedWrite = results.find((result) => result.name === 'approval-gated-write')
    const contextBudget = results.find((result) => result.name === 'context-budget-omits-optional-sections')

    expect(results).toHaveLength(3)
    expect(safeRead).toBeTruthy()
    expect(gatedWrite).toBeTruthy()
    expect(contextBudget).toBeTruthy()

    expect(safeRead!.loopResult.steps[2]?.connectorStatus).toBe('executed')
    expect(safeRead!.loopResult.steps[2]?.policyDecision?.decision).toBe('allow')
    expect(safeRead!.loopResult.approvalRequests).toHaveLength(0)

    expect(gatedWrite!.loopResult.steps[2]?.connectorStatus).toBe('skipped-approval')
    expect(gatedWrite!.loopResult.steps[2]?.approvalRequest?.status).toBe('pending')
    expect(gatedWrite!.loopResult.approvalRequests).toHaveLength(1)

    expect(contextBudget!.prompts.length).toBeGreaterThan(0)
    expect(contextBudget!.prompts[0]).not.toContain('<retrieved_memory>')
    expect(contextBudget!.prompts[0]).not.toContain('<relevant_skills>')
    expect(contextBudget!.loopResult.steps[0]?.omittedPromptSections).toEqual(
      expect.arrayContaining(['working-context', 'retrieved-memory', 'disclosed-skills', 'connector-guidance'])
    )
    expect(contextBudget!.loopResult.steps[0]?.budgetState).toBe('flush')
  })
})
