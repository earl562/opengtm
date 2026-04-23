import { describe, expect, it } from 'vitest'
import {
  createGtmAgenticHarnessJobs,
  createGtmAgenticHarnessPlan,
  runLocalGtmAgenticHarness
} from '../src/gtm-agentic-harness.js'

describe('GTM agentic harness', () => {
  it('builds a bounded orchestrator-worker plan for inbound GTM work', () => {
    const plan = createGtmAgenticHarnessPlan({
      id: 'plan-1',
      workspaceId: 'workspace-1',
      initiativeId: 'initiative-1',
      goal: 'Research Acme inbound lead and draft safe follow-up',
      createdAt: '2026-04-23T19:00:00.000Z'
    })

    expect(plan).toMatchObject({
      id: 'plan-1',
      motion: 'inbound-lead',
      targetEntity: 'Acme inbound lead and draft safe follow-up',
      status: 'queued',
      safety: {
        humanApprovalRequired: true
      }
    })
    expect(plan.stages.map((stage) => stage.id)).toEqual([
      'preflight-safety',
      'lead-research',
      'account-intelligence',
      'outreach-draft',
      'feedback-learning'
    ])
    expect(plan.stages.find((stage) => stage.id === 'outreach-draft')?.approvalRequired).toBe(true)
  })

  it('creates durable parent/child jobs and stops draft work at approval', () => {
    const jobSet = createGtmAgenticHarnessJobs({
      workspaceId: 'workspace-1',
      initiativeId: 'initiative-1',
      workItemId: 'work-item-1',
      goal: 'Research Acme inbound lead and draft safe follow-up',
      createdAt: '2026-04-23T19:00:00.000Z'
    })

    expect(jobSet.jobs).toHaveLength(6)
    expect(jobSet.coordinatorJob.parentJobId).toBeNull()
    expect(jobSet.stageJobs.every((job) => job.parentJobId === jobSet.coordinatorJob.id)).toBe(true)
    expect(jobSet.stageJobs.find((job) => job.metadata.stageId === 'lead-research')?.dependsOnJobIds).toEqual([
      jobSet.stageJobs.find((job) => job.metadata.stageId === 'preflight-safety')?.id
    ])

    const execution = runLocalGtmAgenticHarness({
      plan: jobSet.plan,
      jobs: jobSet.jobs,
      updatedAt: '2026-04-23T19:05:00.000Z'
    })

    expect(execution.status).toBe('awaiting-approval')
    expect(execution.actionRequests).toHaveLength(1)
    expect(execution.jobs.find((job) => job.metadata.stageId === 'outreach-draft')).toMatchObject({
      status: 'awaiting-approval',
      progress: 90
    })
    expect(execution.jobs.find((job) => job.metadata.stageId === 'orchestrator')?.status).toBe('awaiting-approval')
  })

  it('blocks outreach when preflight produces a do-not-send signal', () => {
    const jobSet = createGtmAgenticHarnessJobs({
      workspaceId: 'workspace-1',
      initiativeId: 'initiative-1',
      workItemId: 'work-item-1',
      goal: 'Research Acme but do not send because of recent outreach'
    })

    const execution = runLocalGtmAgenticHarness({
      plan: jobSet.plan,
      jobs: jobSet.jobs,
      doNotSend: true
    })

    expect(execution.status).toBe('blocked')
    expect(execution.actionRequests).toHaveLength(0)
    expect(execution.jobs.find((job) => job.metadata.stageId === 'outreach-draft')).toMatchObject({
      status: 'blocked',
      error: {
        code: 'DO_NOT_SEND_PREFLIGHT'
      }
    })
  })
})
