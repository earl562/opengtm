import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCliRouter } from '../src/router.js'

describe('cli e2e app flow', () => {
  const originalCwd = process.cwd()

  afterEach(() => {
    process.chdir(originalCwd)
  })

  it('boots a workspace, runs the canonical workflow, resolves approval, replays/reruns, and evaluates the harness', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-e2e-app-'))
    process.chdir(cwd)

    const router = createCliRouter()

    const init = await router(['init', '--name=E2E Workspace', '--initiative=Canonical Flow'])
    expect('workspace' in init).toBe(true)

    const workflow = await router(['run', 'workflow', 'crm.roundtrip', 'E2E Prospect'])
    expect('workflowState' in workflow && workflow.workflowState).toBe('awaiting-approval')
    expect('approvalRequestId' in workflow && workflow.approvalRequestId).toBeTypeOf('string')

    const traceId = 'traceId' in workflow ? workflow.traceId : null
    expect(traceId).toBeTypeOf('string')

    const approval = await router(['approvals', 'approve', String(('approvalRequestId' in workflow && workflow.approvalRequestId) || '')])
    const approvalSummary = 'summary' in approval ? (approval as any).summary : null
    expect(approvalSummary?.workflowState).toBe('completed')

    const replay = await router(['traces', 'replay', String(traceId)])
    expect('mode' in replay && replay.mode).toBe('deterministic-replay')

    const rerun = await router(['traces', 'rerun', String(traceId)])
    expect('workflowState' in rerun && rerun.workflowState).toBe('awaiting-approval')

    const evals = await router(['evals', 'run', 'canonical'])
    expect('pass' in evals && evals.pass).toBe(true)
  })
})
