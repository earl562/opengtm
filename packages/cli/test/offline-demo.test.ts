import { describe, expect, it } from 'vitest'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalDaemon } from '@opengtm/daemon'
import { getRecord } from '@opengtm/storage'
import { handleResearchRun } from '../src/handlers/research.js'
import { handleBuildRun } from '../src/handlers/build.js'

describe('cli offline demo', () => {
  it('runs research and build offline without secrets', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-offline-'))
    const daemon = createLocalDaemon({ rootDir })

    const research = await handleResearchRun({
      daemon,
      goal: 'offline research',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    expect(research.traceId).toBeTypeOf('string')
    expect(research.artifactId).toBeTypeOf('string')
    expect(research.artifactPath).toBeTypeOf('string')

    const researchTrace = getRecord<any>(daemon.storage as any, 'run_traces', research.traceId)
    expect(researchTrace).toBeTruthy()
    expect(researchTrace.status).toBe('completed')
    expect(researchTrace.logFilePath).toBe(join(rootDir, 'logs', `run-${research.traceId}.jsonl`))
    expect(existsSync(researchTrace.logFilePath)).toBe(true)

    const build = await handleBuildRun({
      daemon,
      goal: 'offline build',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    expect(build.approvalRequestId).toBeTypeOf('string')
    if (!build.approvalRequestId) {
      throw new Error('Expected approval request id for offline build')
    }
    const approval = getRecord<any>(daemon.storage as any, 'approval_requests', build.approvalRequestId)
    expect(approval).toBeTruthy()

    const buildTrace = getRecord<any>(daemon.storage as any, 'run_traces', build.traceId)
    expect(buildTrace).toBeTruthy()
    expect(buildTrace.status).toBe('awaiting-approval')
    expect(buildTrace.logFilePath).toBe(join(rootDir, 'logs', `run-${build.traceId}.jsonl`))
    expect(existsSync(buildTrace.logFilePath)).toBe(true)
  })
})
