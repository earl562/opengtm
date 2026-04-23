import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalDaemon } from '../src/daemon.js'

describe('daemon agent job ledger', () => {
  it('persists and updates durable agent jobs', () => {
    const daemon = createLocalDaemon({
      rootDir: mkdtempSync(join(tmpdir(), 'opengtm-agent-jobs-'))
    })

    const job = daemon.createAgentJob({
      workspaceId: 'workspace-1',
      initiativeId: 'initiative-1',
      lane: 'build-integrate',
      agentType: 'executor',
      goal: 'Wire durable GTM harness state'
    })

    expect(daemon.listAgentJobs({ workspaceId: 'workspace-1' })).toHaveLength(1)

    const updated = daemon.updateAgentJob(job.id, {
      status: 'running',
      summary: 'Implementation lane active'
    })
    expect(updated.status).toBe('running')
    expect(updated.summary).toBe('Implementation lane active')

    const running = daemon.listAgentJobs({ workspaceId: 'workspace-1', status: 'running' })
    expect(running).toHaveLength(1)
    expect(running[0].id).toBe(job.id)
  })
})
