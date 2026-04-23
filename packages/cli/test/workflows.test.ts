import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalDaemon } from '@opengtm/daemon'
import { getRecord } from '@opengtm/storage'
import { listCanonicalActivities } from '../src/canonical-crm.js'
import { handleApprovals } from '../src/handlers/approvals.js'
import { handleEvals } from '../src/handlers/evals.js'
import { handleFeedback } from '../src/handlers/feedback.js'
import { handleTraces } from '../src/handlers/traces.js'
import { handleWorkflowCatalog, handleWorkflowRun } from '../src/handlers/workflows.js'

describe('cli workflows', () => {
  it('lists the reference workflows and runs a research workflow end to end', async () => {
    const daemon = createLocalDaemon({
      rootDir: mkdtempSync(join(tmpdir(), 'opengtm-workflows-'))
    })

    const catalog = await handleWorkflowCatalog()
    expect(catalog.summary.total).toBeGreaterThan(0)
    expect(catalog.summary.bySupportTier?.['reference-only'] || 0).toBe(0)
    expect(catalog.summary.bySupportTier?.live).toBe(11)
    expect(catalog.summary.canonicalScenarioId).toBe('crm.roundtrip')

    const result = await handleWorkflowRun({
      daemon,
      workflowId: 'sdr.lead_research',
      goal: 'research Acme expansion',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    expect(result.workflowState).toBe('completed')
    expect(result.supportTier).toBe('live')
    expect(result.isCanonical).toBe(false)
    expect(result.canonicalScenarioId).toBeNull()
    expect(result.traceId).toBeTypeOf('string')
    expect(result.artifactId).toBeTypeOf('string')
    expect(result.memoryId).toBeTypeOf('string')
    expect(result.logFilePath).toBeTypeOf('string')

    const trace = getRecord<any>(daemon.storage, 'run_traces', result.traceId!)
    expect(trace.workflowId).toBe('sdr.lead_research')
    expect(trace.persona).toBe('SDR')
    expect(trace.fixtureSetId).toBe('sdr-lead-research')
    expect(trace.status).toBe('completed')
    expect(trace.logFilePath).toBe(result.logFilePath)
    expect(trace.steps.map((step: any) => step.name)).toEqual(['plan', 'observe', 'act', 'reflect'])
    expect(trace.connectorCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'read-connector',
          supportTier: 'live'
        })
      ])
    )
    expect(trace.observedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'truthfulness',
          supportTier: 'live',
          checkpointId: expect.any(String)
        }),
        expect.objectContaining({
          kind: 'harness-loop',
          loopStatus: 'stopped',
          providerId: expect.any(String)
        })
      ])
    )

    const dealRisk = await handleWorkflowRun({
      daemon,
      workflowId: 'ae.deal_risk_scan',
      goal: 'scan deal risk for Acme',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    expect(dealRisk.supportTier).toBe('live')
    expect(dealRisk.artifactId).toBeTypeOf('string')

    const sequence = await handleWorkflowRun({
      daemon,
      workflowId: 'sdr.outreach_sequence',
      goal: 'sequence Acme follow-up',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    expect(sequence.workflowState).toBe('awaiting-approval')
    expect(sequence.supportTier).toBe('live')
    expect(sequence.approvalRequestId).toBeTypeOf('string')
  })

  it('records feedback, shows trace detail, and replays a workflow trace', async () => {
    const daemon = createLocalDaemon({
      rootDir: mkdtempSync(join(tmpdir(), 'opengtm-workflows-trace-'))
    })

    const initial = await handleWorkflowRun({
      daemon,
      workflowId: 'ae.account_brief',
      goal: 'brief me on Acme',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    const traceView = await handleTraces({
      daemon,
      action: 'show',
      id: initial.traceId!,
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    expect('trace' in traceView && traceView.trace?.workflowId).toBe('ae.account_brief')
    expect('summary' in traceView && (traceView as any).summary?.feedbackCount).toBe(0)

    const feedback = await handleFeedback({
      daemon,
      action: 'record',
      feedbackAction: 'revise',
      traceId: initial.traceId!,
      actor: 'qa',
      message: 'Tighten the account brief summary.'
    })

    expect(!Array.isArray(feedback.feedback) && feedback.feedback.action).toBe('revise')

    const updatedTrace = getRecord<any>(daemon.storage, 'run_traces', initial.traceId!)
    expect(updatedTrace.feedbackEventIds).toContain(
      !Array.isArray(feedback.feedback) ? feedback.feedback.id : ''
    )

    const replay = await handleTraces({
      daemon,
      action: 'replay',
      id: initial.traceId!,
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    expect('mode' in replay && replay.mode).toBe('deterministic-replay')
    expect('trace' in replay && replay.trace?.id).toBe(initial.traceId)

    const rerun = await handleTraces({
      daemon,
      action: 'rerun',
      id: initial.traceId!,
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    expect('workflowState' in rerun && rerun.workflowState).toBe('completed')
    expect('traceId' in rerun && rerun.traceId).not.toBe(initial.traceId)
  })

  it('runs approval-gated workflows and eval suites through public handlers', async () => {
    const daemon = createLocalDaemon({
      rootDir: mkdtempSync(join(tmpdir(), 'opengtm-workflows-ops-'))
    })

    const workflow = await handleWorkflowRun({
      daemon,
      workflowId: 'sdr.outreach_compose',
      goal: 'draft first touch for Acme',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    expect(workflow.workflowState).toBe('awaiting-approval')
    expect(workflow.supportTier).toBe('live')
    expect(workflow.approvalRequestId).toBeTypeOf('string')
    expect(workflow.artifactId).toBeTypeOf('string')
    const trace = getRecord<any>(daemon.storage, 'run_traces', workflow.traceId!)
    const approval = getRecord<any>(daemon.storage, 'approval_requests', workflow.approvalRequestId!)
    expect(trace?.status).toBe('awaiting-approval')
    expect(trace?.steps.map((step: any) => step.name)).toEqual(['plan', 'observe', 'act', 'reflect'])
    expect(trace?.steps[2]?.status).toBe('awaiting-approval')
    expect(trace?.policyDecisionIds).toHaveLength(1)
    expect(trace?.artifactIds).toContain(workflow.artifactId)
    expect(trace?.connectorCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'send-message',
          supportTier: 'live',
          connectorStatus: 'skipped-approval'
        })
      ])
    )
    expect(trace?.observedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'harness-loop',
          approvalsRequested: 1
        })
      ])
    )
    expect(approval?.status).toBe('pending')

    const evals = await handleEvals({ suite: 'ablations' })
    expect(Array.isArray(evals.results)).toBe(true)
    expect((evals.results as unknown[]).length).toBeGreaterThan(0)

    const canonical = await handleEvals({ suite: 'canonical' })
    expect(canonical).toMatchObject({
      suite: 'canonical',
      canonicalScenarioId: 'crm.roundtrip',
      pass: true
    })

    const longitudinal = await handleEvals({ suite: 'longitudinal' })
    expect(longitudinal).toMatchObject({
      suite: 'longitudinal',
      canonicalScenarioId: 'crm.roundtrip',
      pass: true
    })
  })

  it('logs CRM activity when live outreach compose is approved', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-live-compose-'))
    const daemon = createLocalDaemon({ rootDir })

    const workflow = await handleWorkflowRun({
      daemon,
      workflowId: 'sdr.outreach_compose',
      goal: 'Jamie Prospect',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    await handleFeedback({
      daemon,
      action: 'record',
      feedbackAction: 'revise',
      traceId: workflow.traceId!,
      actor: 'qa',
      message: 'Ensure the draft stays personalized.'
    })

    const approval = await handleApprovals({ daemon, action: 'approve', id: workflow.approvalRequestId! })

    expect((approval.summary as any)?.workflowState).toBe('completed')

    const activities = listCanonicalActivities(join(rootDir, 'fixtures', 'opengtm-crm.sqlite'))
    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'email'
        })
      ])
    )
  })
})
