import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCliRouter } from '../src/router.js'

describe('agent job CLI surface', () => {
  const originalCwd = process.cwd()

  afterEach(() => {
    process.chdir(originalCwd)
  })

  it('keeps catalog scaffolding and persists agent job lifecycle state', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-agent-cli-'))
    process.chdir(cwd)
    const router = createCliRouter()

    await router(['init', '--name=Demo', '--initiative=Agent Jobs'])

    const scaffold = await router(['agent', 'new', 'research_assistant'])
    expect(scaffold).toMatchObject({
      kind: 'agents',
      action: 'new',
      agent: {
        id: 'research_assistant'
      }
    })

    const created = await router([
      'agent',
      'job',
      'create',
      'executor',
      'Build durable GTM harness state',
      '--lane=build-integrate',
      '--constraints=no new dependencies,keep diff small',
      '--outputs=tests,operator summary'
    ])
    expect(created).toMatchObject({
      kind: 'agents',
      action: 'job-create',
      job: {
        agentType: 'executor',
        lane: 'build-integrate',
        status: 'queued',
        constraints: ['no new dependencies', 'keep diff small'],
        requiredOutputs: ['tests', 'operator summary']
      }
    })

    const jobId = String((created as any).job.id)
    const updated = await router([
      'agent',
      'job',
      'update',
      jobId,
      '--status=running',
      '--progress=40',
      '--summary=implementation active',
      '--sources=artifact-1,trace-1'
    ])
    expect(updated).toMatchObject({
      kind: 'agents',
      action: 'job-update',
      job: {
        id: jobId,
        status: 'running',
        progress: 40,
        summary: 'implementation active',
        sourceIds: ['artifact-1', 'trace-1']
      }
    })

    const listed = await router(['agent', 'job', 'list'])
    expect(listed).toMatchObject({
      kind: 'agents',
      action: 'job-list',
      summary: {
        total: 1,
        running: 1
      }
    })
    expect((listed as any).jobs[0].sourceIds).toEqual(['artifact-1', 'trace-1'])

    const harness = await router([
      'agent',
      'harness',
      'run',
      'Research Acme inbound lead and draft safe follow-up'
    ])
    expect(harness).toMatchObject({
      kind: 'agents',
      action: 'harness-run',
      harness: {
        motion: 'inbound-lead',
        status: 'awaiting-approval',
        stageCount: 5
      },
      summary: {
        awaitingApproval: 2
      }
    })
    expect((harness as any).harness.approvalRequestId).toBeTruthy()
    expect((harness as any).harness.traceId).toBeTruthy()
    expect((harness as any).harness.artifactPath).toContain('artifacts')
    expect((harness as any).jobs.some((job: any) => job.parentJobId)).toBe(true)

    const approvals = await router(['approvals', 'list'])
    expect((approvals as any).summary.pending).toBe(1)
  })
})
