import { describe, expect, it } from 'vitest'
import { createPolicyDecisionFromAction, createPolicyDecisionFromActionWithConfig } from '../src/approval.js'

describe('policy config', () => {
  it('allows safe read actions without approval', () => {
    const decision = createPolicyDecisionFromAction({
      workItemId: 'w-read',
      lane: 'research',
      actionType: 'read-connector',
      connectorFamily: 'docs',
      target: 'brief.md'
    })

    expect(decision.approvalRequired).toBe(false)
    expect(decision.decision).toBe('allow')
  })

  it('forces approval when action is configured', () => {
    const decision = createPolicyDecisionFromActionWithConfig(
      { workItemId: 'w1', lane: 'research', actionType: 'write-repo', target: 'x' },
      { version: '1', requireApprovalForActions: ['write-repo'], escalateForActions: [] }
    )
    expect(decision.approvalRequired).toBe(true)
    expect(decision.decision).toBe('require-approval')
  })
})
