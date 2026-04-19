import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalDaemon } from '@opengtm/daemon'
import { getRecord, readArtifactBlob } from '@opengtm/storage'
import { describe, expect, it } from 'vitest'
import { handleBuildRun } from '../src/handlers/build.js'
import { handleResearchRun } from '../src/handlers/research.js'
import { createCliRouter } from '../src/router.js'

describe('cli autonomy modes', () => {
  it('treats bare `opengtm` as the default entry command', async () => {
    const router = createCliRouter()
    const bare = await router([])
    const explicit = await router(['opengtm'])
    expect(bare).toEqual(explicit)
  })

  it('queues research when autonomy is background', async () => {
    const daemon = createLocalDaemon({
      rootDir: mkdtempSync(join(tmpdir(), 'opengtm-autonomy-research-'))
    })

    const result = await handleResearchRun({
      daemon,
      goal: 'background research',
      workspaceId: 'w1',
      initiativeId: 'i1',
      autonomyMode: 'background'
    })

    const trace = getRecord<any>(daemon.storage, 'run_traces', result.traceId)
    expect(result.summary).toMatchObject({
      autonomyMode: 'background',
      workflowState: 'queued'
    })
    expect(trace?.status).toBe('queued')
  })

  it('queues build when autonomy is background', async () => {
    const daemon = createLocalDaemon({
      rootDir: mkdtempSync(join(tmpdir(), 'opengtm-autonomy-build-bg-'))
    })

    const result = await handleBuildRun({
      daemon,
      goal: 'background build',
      workspaceId: 'w1',
      initiativeId: 'i1',
      autonomyMode: 'background'
    })

    const trace = getRecord<any>(daemon.storage, 'run_traces', result.traceId)
    expect(result.summary).toMatchObject({
      autonomyMode: 'background',
      workflowState: 'queued',
      approvalState: 'deferred'
    })
    expect(trace?.status).toBe('queued')
  })

  it('completes build end-to-end when autonomy is full', async () => {
    const daemon = createLocalDaemon({
      rootDir: mkdtempSync(join(tmpdir(), 'opengtm-autonomy-build-full-'))
    })

    const result = await handleBuildRun({
      daemon,
      goal: 'full autonomous build',
      workspaceId: 'w1',
      initiativeId: 'i1',
      autonomyMode: 'full'
    })

    if (!result.approvalRequestId) {
      throw new Error('Expected approval id for full autonomy build')
    }

    const approval = getRecord<any>(daemon.storage, 'approval_requests', result.approvalRequestId)
    const trace = getRecord<any>(daemon.storage, 'run_traces', result.traceId)
    const workItem = getRecord<any>(daemon.storage, 'work_items', result.workItem.id)

    expect(result.summary).toMatchObject({
      autonomyMode: 'full',
      workflowState: 'completed',
      approvalState: 'approved'
    })
    expect(approval?.status).toBe('approved')
    expect(trace?.status).toBe('completed')
    expect(workItem?.status).toBe('completed')
    expect(result.artifactPath).toBeTypeOf('string')
  })

  it('produces a simulated continuation artifact when autonomy is dry-run', async () => {
    const daemon = createLocalDaemon({
      rootDir: mkdtempSync(join(tmpdir(), 'opengtm-autonomy-build-dry-'))
    })

    const result = await handleBuildRun({
      daemon,
      goal: 'dry run build',
      workspaceId: 'w1',
      initiativeId: 'i1',
      autonomyMode: 'dry-run'
    })

    if (!result.artifactPath) {
      throw new Error('Expected artifact path for dry-run build')
    }

    const payload = readArtifactBlob(result.artifactPath, { parseJson: true })

    expect(result.summary).toMatchObject({
      autonomyMode: 'dry-run',
      workflowState: 'completed',
      approvalState: 'approved'
    })
    expect(payload).toMatchObject({
      executionMode: 'dry-run',
      workflowState: 'completed'
    })
  })
})
