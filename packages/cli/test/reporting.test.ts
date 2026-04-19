import { describe, expect, it } from 'vitest'
import {
  renderCanonicalDebugBundleMarkdown,
  renderCanonicalEvalMarkdown
} from '../src/reporting.js'

describe('cli reporting', () => {
  it('renders canonical eval markdown with thresholds and evidence', () => {
    const output = renderCanonicalEvalMarkdown({
      suite: 'canonical',
      canonicalScenarioId: 'crm.roundtrip',
      pass: true,
      thresholds: { governanceQuality: 85 },
      dimensions: { governanceQuality: 94 },
      expectedMinimumDeltas: { policyGatingOff: -10 },
      observedDeltas: { policyGatingOff: -40 },
      evidence: { approvalCount: 2 }
    })

    expect(output).toContain('Canonical Externalization Eval Report')
    expect(output).toContain('governanceQuality')
    expect(output).toContain('threshold 85')
    expect(output).toContain('approvalCount')
  })

  it('renders canonical debug bundle markdown with workflow and trace sections', () => {
    const output = renderCanonicalDebugBundleMarkdown({
      generatedAt: '2026-04-19T00:00:00.000Z',
      canonicalScenarioId: 'crm.roundtrip',
      workflowRun: { traceId: 'trace-1' },
      approval: { approval: { id: 'approval-1' } },
      trace: { trace: { id: 'trace-1' } },
      replay: { mode: 'deterministic-replay' },
      rerun: { traceId: 'trace-2' }
    })

    expect(output).toContain('Canonical Debug Bundle')
    expect(output).toContain('Workflow Run')
    expect(output).toContain('deterministic-replay')
    expect(output).toContain('trace-2')
  })
})
