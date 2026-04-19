import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalDaemon } from '@opengtm/daemon'
import { getRecord, listRecords, readArtifactBlob } from '@opengtm/storage'
import { listCanonicalActivities } from '../src/canonical-crm.js'
import { handleApprovals } from '../src/handlers/approvals.js'
import { handleWorkflowRun } from '../src/handlers/workflows.js'

describe('canonical crm roundtrip', () => {
  it('runs the canonical workflow to approval and records live support-tier metadata', async () => {
    const daemon = createLocalDaemon({
      rootDir: mkdtempSync(join(tmpdir(), 'opengtm-canonical-live-'))
    })

    const result = await handleWorkflowRun({
      daemon,
      workflowId: 'crm.roundtrip',
      goal: 'Pat Example',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    expect(result.workflowState).toBe('awaiting-approval')
    expect(result.supportTier).toBe('live')
    expect(result.isCanonical).toBe(true)
    expect(result.canonicalScenarioId).toBe('crm.roundtrip')
    expect(result.approvalRequestId).toBeTypeOf('string')

    const trace = getRecord<any>(daemon.storage, 'run_traces', result.traceId!)
    expect(trace).toBeTruthy()
    expect(trace.workflowId).toBe('crm.roundtrip')
    expect(trace.observedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'truthfulness',
          supportTier: 'live',
          canonicalScenarioId: 'crm.roundtrip'
        })
      ])
    )

    const artifacts = listRecords<any>(daemon.storage, 'artifacts')
    expect(artifacts.some((artifact) => artifact.title.includes('Canonical checkpoint'))).toBe(true)
  })

  it('logs approved canonical workflow outcomes back to the local CRM fixture', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-canonical-approve-'))
    const daemon = createLocalDaemon({ rootDir })

    const workflow = await handleWorkflowRun({
      daemon,
      workflowId: 'crm.roundtrip',
      goal: 'Taylor Buyer',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    const resolution = await handleApprovals({
      daemon,
      action: 'approve',
      id: workflow.approvalRequestId!
    })

    expect(resolution.summary).toMatchObject({
      approvalState: 'approved',
      workflowState: 'completed'
    })

    const activities = listCanonicalActivities(join(rootDir, 'fixtures', 'opengtm-crm.sqlite'))
    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'email'
        })
      ])
    )

    const artifact = resolution.artifact?.path
      ? readArtifactBlob(resolution.artifact.path, { parseJson: true })
      : null
    expect(artifact).toMatchObject({
      canonicalScenarioId: 'crm.roundtrip',
      crmActivityId: expect.any(String),
      supportTier: 'live'
    })
  })

  it('logs denied canonical workflow outcomes back to the local CRM fixture', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-canonical-deny-'))
    const daemon = createLocalDaemon({ rootDir })

    const workflow = await handleWorkflowRun({
      daemon,
      workflowId: 'crm.roundtrip',
      goal: 'Morgan Prospect',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    const resolution = await handleApprovals({
      daemon,
      action: 'deny',
      id: workflow.approvalRequestId!
    })

    expect(resolution.summary).toMatchObject({
      approvalState: 'denied',
      workflowState: 'cancelled'
    })

    const activities = listCanonicalActivities(join(rootDir, 'fixtures', 'opengtm-crm.sqlite'))
    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note',
          subject: expect.stringContaining('Denied outreach draft')
        })
      ])
    )

    const trace = getRecord<any>(daemon.storage, 'run_traces', workflow.traceId!)
    expect(trace.observedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'recovery-semantics',
          scope: 'approval-deny'
        })
      ])
    )
  })
})
