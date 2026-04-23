import { describe, expect, it } from 'vitest'
import {
  applySubagentFinalResultToAgentJob,
  applySubagentStatusToAgentJob,
  createAgentJob,
  updateAgentJob
} from '../src/agent-job.js'

describe('agent job lifecycle', () => {
  it('creates a queued durable agent job record', () => {
    const job = createAgentJob({
      id: 'job-1',
      workspaceId: 'workspace-1',
      initiativeId: 'initiative-1',
      lane: 'build-integrate',
      agentType: 'executor',
      goal: 'Build the GTM engineering harness',
      constraints: ['no new dependencies'],
      requiredOutputs: ['tests']
    })

    expect(job).toMatchObject({
      id: 'job-1',
      workspaceId: 'workspace-1',
      initiativeId: 'initiative-1',
      lane: 'build-integrate',
      agentType: 'executor',
      goal: 'Build the GTM engineering harness',
      status: 'queued',
      constraints: ['no new dependencies'],
      requiredOutputs: ['tests'],
      progress: null,
      startedAt: null,
      endedAt: null
    })
    expect(job.updatedAt).toBe(job.createdAt)
  })

  it('moves through running and completed lifecycle states', () => {
    const queued = createAgentJob({
      workspaceId: 'workspace-1',
      initiativeId: 'initiative-1',
      lane: 'build-integrate',
      agentType: 'executor',
      goal: 'Create durable state'
    })

    const running = updateAgentJob(queued, {
      status: 'running',
      progress: 25,
      summary: 'Implementation started',
      updatedAt: '2026-04-23T18:00:00.000Z'
    })
    expect(running.status).toBe('running')
    expect(running.startedAt).toBe('2026-04-23T18:00:00.000Z')
    expect(running.progress).toBe(25)

    const completed = updateAgentJob(running, {
      status: 'completed',
      progress: 100,
      artifactIds: ['artifact-1'],
      output: { shipped: true },
      updatedAt: '2026-04-23T18:05:00.000Z'
    })
    expect(completed.status).toBe('completed')
    expect(completed.endedAt).toBe('2026-04-23T18:05:00.000Z')
    expect(completed.artifactIds).toEqual(['artifact-1'])
    expect(completed.output).toEqual({ shipped: true })
  })

  it('clears terminal timestamps when a failed job is requeued and starts a fresh retry', () => {
    const queued = createAgentJob({
      workspaceId: 'workspace-1',
      initiativeId: 'initiative-1',
      lane: 'build-integrate',
      agentType: 'executor',
      goal: 'Retry failed harness work'
    })
    const running = updateAgentJob(queued, {
      status: 'running',
      updatedAt: '2026-04-23T18:00:00.000Z'
    })
    const failed = updateAgentJob(running, {
      status: 'failed',
      error: {
        code: 'TEST_FAILURE',
        message: 'Regression failed.'
      },
      updatedAt: '2026-04-23T18:05:00.000Z'
    })
    expect(failed.startedAt).toBe('2026-04-23T18:00:00.000Z')
    expect(failed.endedAt).toBe('2026-04-23T18:05:00.000Z')

    const requeued = updateAgentJob(failed, {
      status: 'queued',
      updatedAt: '2026-04-23T18:10:00.000Z'
    })
    expect(requeued.startedAt).toBeNull()
    expect(requeued.endedAt).toBeNull()

    const retried = updateAgentJob(requeued, {
      status: 'running',
      updatedAt: '2026-04-23T18:15:00.000Z'
    })
    expect(retried.startedAt).toBe('2026-04-23T18:15:00.000Z')
    expect(retried.endedAt).toBeNull()
  })

  it('preserves the active attempt start when blocked or approval-waiting jobs resume', () => {
    const running = updateAgentJob(createAgentJob({
      workspaceId: 'workspace-1',
      initiativeId: 'initiative-1',
      lane: 'ops-automate',
      agentType: 'executor',
      goal: 'Resume gated work'
    }), {
      status: 'running',
      updatedAt: '2026-04-23T18:00:00.000Z'
    })

    const blocked = updateAgentJob(running, {
      status: 'blocked',
      summary: 'Waiting on docs context',
      updatedAt: '2026-04-23T18:05:00.000Z'
    })
    const resumedFromBlocked = updateAgentJob(blocked, {
      status: 'running',
      updatedAt: '2026-04-23T18:10:00.000Z'
    })
    expect(resumedFromBlocked.startedAt).toBe('2026-04-23T18:00:00.000Z')
    expect(resumedFromBlocked.endedAt).toBeNull()

    const awaitingApproval = updateAgentJob(resumedFromBlocked, {
      status: 'awaiting-approval',
      approvalRequestId: 'approval-1',
      updatedAt: '2026-04-23T18:15:00.000Z'
    })
    const resumedFromApproval = updateAgentJob(awaitingApproval, {
      status: 'running',
      updatedAt: '2026-04-23T18:20:00.000Z'
    })
    expect(resumedFromApproval.startedAt).toBe('2026-04-23T18:00:00.000Z')
    expect(resumedFromApproval.endedAt).toBeNull()
  })

  it('applies subagent-style status and final-result updates', () => {
    const job = createAgentJob({
      workspaceId: 'workspace-1',
      initiativeId: 'initiative-1',
      lane: 'research',
      agentType: 'researcher',
      goal: 'Research account context'
    })

    const running = applySubagentStatusToAgentJob(job, {
      status: 'running',
      summary: 'Reading CRM and docs context',
      progress: 50
    })
    expect(running.status).toBe('running')
    expect(running.summary).toBe('Reading CRM and docs context')

    const failed = applySubagentFinalResultToAgentJob(running, {
      status: 'failed',
      summary: 'Docs connector unavailable',
      error: {
        code: 'DOCS_UNAVAILABLE',
        message: 'Docs connector returned no workspace.'
      },
      artifacts: ['trace-1']
    })
    expect(failed.status).toBe('failed')
    expect(failed.error?.code).toBe('DOCS_UNAVAILABLE')
    expect(failed.artifactIds).toEqual(['trace-1'])
    expect(failed.endedAt).toBeTruthy()
  })
})
