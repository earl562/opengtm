import { describe, expect, it } from 'vitest'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalDaemon } from '@opengtm/daemon'
import { handleOpsRun } from '../src/handlers/ops.js'
import { handleResearchRun } from '../src/handlers/research.js'
import { getRecord } from '@opengtm/storage'

describe('cli observability wiring', () => {
  it('creates a JSONL log file and stores logFilePath on the run trace', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-cli-obs-'))
    const daemon = createLocalDaemon({ rootDir })

    const result = await handleResearchRun({
      daemon,
      goal: 'test goal',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })

    const trace = getRecord<any>(daemon.storage as any, 'run_traces', result.traceId)
    expect(trace).toBeTruthy()

    const expectedPath = join(rootDir, 'logs', `run-${result.traceId}.jsonl`)
    expect(trace.logFilePath).toBe(expectedPath)
    expect(existsSync(expectedPath)).toBe(true)

    const lines = readFileSync(expectedPath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l))

    expect(lines.some((e) => e.eventType === 'run.start')).toBe(true)
    expect(lines.some((e) => e.eventType === 'provider.selected')).toBe(true)
    expect(lines.some((e) => e.eventType === 'step.started')).toBe(true)
    expect(lines.some((e) => e.eventType === 'step.completed')).toBe(true)
    expect(lines.some((e) => e.eventType === 'connector.attempted')).toBe(true)
    expect(lines.some((e) => e.eventType === 'connector.executed')).toBe(true)
    expect(lines.some((e) => e.eventType === 'run.summary')).toBe(true)
  })

  it('emits approval-gated harness events for ops workflows', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-cli-ops-obs-'))
    const daemon = createLocalDaemon({ rootDir })

    const result = await handleOpsRun({
      daemon,
      goal: 'compose outbound for Acme',
      workspaceId: 'w1',
      initiativeId: 'i1',
      workflowId: 'sdr.outreach_compose',
      workflowRunId: 'ops-run-obs',
      persona: 'SDR',
      fixtureSetId: 'sdr-outreach-compose',
      requiresApproval: true
    })

    const trace = getRecord<any>(daemon.storage as any, 'run_traces', result.traceId)
    expect(trace).toBeTruthy()

    const expectedPath = join(rootDir, 'logs', `run-${result.traceId}.jsonl`)
    expect(trace.logFilePath).toBe(expectedPath)
    expect(existsSync(expectedPath)).toBe(true)

    const lines = readFileSync(expectedPath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l))

    expect(lines.some((e) => e.eventType === 'provider.selected')).toBe(true)
    expect(lines.some((e) => e.eventType === 'approval.requested')).toBe(true)
    expect(lines.some((e) => e.eventType === 'connector.skipped')).toBe(true)
    expect(lines.some((e) => e.eventType === 'run.summary')).toBe(true)
  })
})
