export interface CanonicalEvalReport {
  suite: string
  canonicalScenarioId: string
  pass: boolean
  thresholds: Record<string, number>
  dimensions: Record<string, number>
  expectedMinimumDeltas: Record<string, number>
  observedDeltas: Record<string, number | null>
  evidence: Record<string, unknown>
}

export interface CanonicalDebugBundleReport {
  generatedAt: string
  canonicalScenarioId: string
  workspace?: Record<string, unknown>
  workflowRun?: Record<string, unknown>
  approval?: Record<string, unknown>
  trace?: Record<string, unknown>
  replay?: Record<string, unknown>
  rerun?: Record<string, unknown>
}

function markdownTable(rows: Array<[string, string]>) {
  return [
    '| Key | Value |',
    '| --- | --- |',
    ...rows.map(([key, value]) => `| ${key} | ${value} |`)
  ].join('\n')
}

export function renderCanonicalEvalMarkdown(report: CanonicalEvalReport) {
  const dimensions = Object.entries(report.dimensions).map(([name, score]) => [
    name,
    `${score} (threshold ${report.thresholds[name] ?? 'n/a'})`
  ] as [string, string])
  const deltas = Object.entries(report.observedDeltas).map(([name, value]) => [
    name,
    `${value ?? 'n/a'} (expected <= ${report.expectedMinimumDeltas[name] ?? 'n/a'})`
  ] as [string, string])
  const evidence = Object.entries(report.evidence).map(([key, value]) => [
    key,
    typeof value === 'string' ? value : `\`${JSON.stringify(value)}\``
  ] as [string, string])

  return [
    '# Canonical Externalization Eval Report',
    '',
    `- suite: \`${report.suite}\``,
    `- canonical scenario: \`${report.canonicalScenarioId}\``,
    `- pass: **${report.pass}**`,
    '',
    '## Dimension Scores',
    '',
    markdownTable(dimensions),
    '',
    '## Ablation Deltas',
    '',
    markdownTable(deltas),
    '',
    '## Evidence',
    '',
    markdownTable(evidence)
  ].join('\n')
}

export function renderCanonicalDebugBundleMarkdown(report: CanonicalDebugBundleReport) {
  const workflowRun = report.workflowRun as any
  const approval = report.approval as any
  const trace = report.trace as any
  const summaryRows: Array<[string, string]> = [
    ['generatedAt', report.generatedAt],
    ['canonicalScenarioId', report.canonicalScenarioId],
    ['workflowRunId', String(workflowRun?.workflowRun ? workflowRun.workflowRun?.id : (workflowRun?.workflowRunId ?? 'n/a'))],
    ['approvalRequestId', String(workflowRun?.approvalRequestId ?? approval?.approval?.id ?? 'n/a')],
    ['traceId', String(workflowRun?.traceId ?? trace?.trace?.id ?? 'n/a')]
  ]

  return [
    '# Canonical Debug Bundle',
    '',
    '## Summary',
    '',
    markdownTable(summaryRows),
    '',
    '## Workflow Run JSON',
    '',
    '```json',
    JSON.stringify(report.workflowRun ?? {}, null, 2),
    '```',
    '',
    '## Approval Resolution JSON',
    '',
    '```json',
    JSON.stringify(report.approval ?? {}, null, 2),
    '```',
    '',
    '## Trace Detail JSON',
    '',
    '```json',
    JSON.stringify(report.trace ?? {}, null, 2),
    '```',
    '',
    '## Replay JSON',
    '',
    '```json',
    JSON.stringify(report.replay ?? {}, null, 2),
    '```',
    '',
    '## Rerun JSON',
    '',
    '```json',
    JSON.stringify(report.rerun ?? {}, null, 2),
    '```'
  ].join('\n')
}
