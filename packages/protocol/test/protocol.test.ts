import { describe, expect, it } from 'vitest'
import {
  validateApprovalDecisionEnvelope,
  validateApprovalRenderEnvelope,
  validateGatewayEvent,
  validateSubagentDelegationRequest,
  validateSubagentFinalResult,
  validateSubagentStatusUpdate,
  validateToolCallRequest,
  validateToolCallResult,
  validateUserSessionMessageEnvelope
} from '../src/schemas.js'

const createdAt = new Date().toISOString()

const baseEnvelope = {
  id: 'env-1',
  version: '1.0' as const,
  createdAt,
  source: { kind: 'agent' as const, id: 'planner' },
  target: { kind: 'tool' as const, id: 'crm.lookup' },
  context: { sessionId: 'session-1', workItemId: 'work-1', traceId: 'trace-1', lane: 'research' },
  boundary: {
    approvalRequired: false,
    trustLevel: 'internal' as const,
    sandbox: 'read-only' as const,
    scopes: ['contacts.read']
  },
  discovery: {
    family: 'crm',
    version: '2026-04',
    capabilities: ['lookup-contact'],
    tags: ['discovery']
  }
}

describe('protocol: gateway event validation', () => {
  it('rejects malformed gateway event', () => {
    const result = validateGatewayEvent({ type: 'command' })
    expect(result.ok).toBe(false)
  })

  it('accepts valid command event', () => {
    const result = validateGatewayEvent({
      gatewayId: 'discord',
      receivedAt: new Date().toISOString(),
      type: 'command',
      userId: 'u1',
      channelId: 'c1',
      command: 'opengtm help',
      args: []
    })
    expect(result.ok).toBe(true)
  })
})

describe('protocol: tool call envelopes', () => {
  it('accepts a valid tool call request', () => {
    const result = validateToolCallRequest({
      ...baseEnvelope,
      kind: 'tool.call.request',
      callId: 'call-1',
      tool: 'crm.lookup',
      input: { email: 'dev@example.com' },
      lifecycle: { state: 'requested', mode: 'async', timeoutMs: 5000 },
      permissions: { idempotent: true, mutatesExternalState: false }
    })

    expect(result.ok).toBe(true)
  })

  it('rejects a tool call result missing error details', () => {
    const result = validateToolCallResult({
      ...baseEnvelope,
      kind: 'tool.call.result',
      callId: 'call-1',
      tool: 'crm.lookup',
      status: 'error',
      lifecycle: { state: 'failed', durationMs: 10 }
    })

    expect(result.ok).toBe(false)
  })
})

describe('protocol: subagent envelopes', () => {
  it('accepts a valid delegation request', () => {
    const result = validateSubagentDelegationRequest({
      ...baseEnvelope,
      kind: 'subagent.delegation.request',
      target: { kind: 'subagent', id: 'research-agent' },
      delegationId: 'delegation-1',
      subagentType: 'research',
      task: {
        goal: 'Collect CRM account notes',
        constraints: ['read only'],
        requiredOutputs: ['summary'],
        artifacts: ['artifact-1']
      },
      lifecycle: { status: 'queued', priority: 'high' }
    })

    expect(result.ok).toBe(true)
  })

  it('rejects a status update with invalid progress', () => {
    const result = validateSubagentStatusUpdate({
      ...baseEnvelope,
      kind: 'subagent.status.update',
      target: { kind: 'agent', id: 'planner' },
      delegationId: 'delegation-1',
      subagentType: 'research',
      status: 'running',
      summary: 'working',
      progress: 120
    })

    expect(result.ok).toBe(false)
  })

  it('rejects a failed final result without an error payload', () => {
    const result = validateSubagentFinalResult({
      ...baseEnvelope,
      kind: 'subagent.final.result',
      delegationId: 'delegation-1',
      subagentType: 'research',
      status: 'failed',
      summary: 'failed to fetch'
    })

    expect(result.ok).toBe(false)
  })
})

describe('protocol: user session and approval envelopes', () => {
  it('accepts a valid user session message envelope', () => {
    const result = validateUserSessionMessageEnvelope({
      ...baseEnvelope,
      kind: 'user.session.message',
      source: { kind: 'agent', id: 'assistant-1' },
      target: { kind: 'user', id: 'user-1' },
      sessionMessageId: 'msg-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: 'I need approval before sending this change.',
      delivery: { channel: 'discord:#gtm', visibility: 'private' }
    })

    expect(result.ok).toBe(true)
  })

  it('accepts a valid approval render envelope', () => {
    const result = validateApprovalRenderEnvelope({
      ...baseEnvelope,
      kind: 'user.approval.render',
      target: { kind: 'user', id: 'user-1' },
      approvalRequestId: 'approval-1',
      sessionId: 'session-1',
      workItemId: 'work-1',
      title: 'Approve CRM update',
      summary: 'Apply the prepared CRM enrichment changes?',
      riskLevel: 'high',
      options: ['approved', 'denied']
    })

    expect(result.ok).toBe(true)
  })

  it('rejects an approval decision with an invalid decision', () => {
    const result = validateApprovalDecisionEnvelope({
      ...baseEnvelope,
      kind: 'user.approval.decision',
      source: { kind: 'user', id: 'user-1' },
      target: { kind: 'agent', id: 'planner' },
      approvalRequestId: 'approval-1',
      sessionId: 'session-1',
      decision: 'maybe',
      decidedAt: createdAt,
      decidedBy: 'user-1'
    })

    expect(result.ok).toBe(false)
  })
})
