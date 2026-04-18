import { describe, expect, it } from 'vitest'
import { createPolicyDecisionFromActionWithConfig } from '../src/approval.js'

describe('policy config', () => {
  it('forces approval when action is configured', () => {
    const decision = createPolicyDecisionFromActionWithConfig(
      { workItemId: 'w1', lane: 'research', actionType: 'write-repo', target: 'x' },
      { version: '1', requireApprovalForActions: ['write-repo'], escalateForActions: [] }
    )
    expect(decision.approvalRequired).toBe(true)
    expect(decision.decision).toBe('require-approval')
  })
})
