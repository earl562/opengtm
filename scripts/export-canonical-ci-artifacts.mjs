import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const rootDir = process.cwd()
const outDir = path.join(rootDir, 'reports', 'ci')
mkdirSync(outDir, { recursive: true })

const cliEntry = path.join(rootDir, 'packages', 'cli', 'bin', 'opengtm.js')

function runCliJson(cwd, args) {
  const raw = execFileSync('node', [cliEntry, ...args, '--json'], {
    cwd,
    encoding: 'utf8'
  })
  return JSON.parse(raw)
}

function renderEvalMarkdown(report) {
  const lines = [
    '# Canonical Externalization Eval Report',
    '',
    `- suite: \`${report.suite}\``,
    `- canonical scenario: \`${report.canonicalScenarioId}\``,
    `- pass: **${report.pass}**`,
    '',
    '## Dimensions',
    ''
  ]

  for (const [key, score] of Object.entries(report.dimensions ?? {})) {
    lines.push(`- ${key}: ${score} (threshold ${report.thresholds?.[key] ?? 'n/a'})`)
  }

  lines.push('', '## Observed Deltas', '')
  for (const [key, value] of Object.entries(report.observedDeltas ?? {})) {
    lines.push(`- ${key}: ${value} (expected <= ${report.expectedMinimumDeltas?.[key] ?? 'n/a'})`)
  }

  lines.push('', '## Evidence', '', '```json', JSON.stringify(report.evidence ?? {}, null, 2), '```')
  return lines.join('\n')
}

function renderDebugMarkdown(report) {
  return [
    '# Canonical Debug Bundle',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- canonical scenario: ${report.canonicalScenarioId}`,
    '',
    '## Workflow Run',
    '```json',
    JSON.stringify(report.workflowRun, null, 2),
    '```',
    '',
    '## Approval',
    '```json',
    JSON.stringify(report.approval, null, 2),
    '```',
    '',
    '## Trace',
    '```json',
    JSON.stringify(report.trace, null, 2),
    '```',
    '',
    '## Replay',
    '```json',
    JSON.stringify(report.replay, null, 2),
    '```',
    '',
    '## Rerun',
    '```json',
    JSON.stringify(report.rerun, null, 2),
    '```'
  ].join('\n')
}

const tempWorkspace = mkdtempSync(path.join(tmpdir(), 'opengtm-ci-report-'))

const workspace = runCliJson(tempWorkspace, ['init', '--name=CI Reports', '--initiative=Canonical Reports'])
const workflowRun = runCliJson(tempWorkspace, ['run', 'workflow', 'crm.roundtrip', 'CI Artifact Lead'])
const approval = runCliJson(tempWorkspace, ['approvals', 'approve', workflowRun.approvalRequestId])
const trace = runCliJson(tempWorkspace, ['traces', 'show', workflowRun.traceId])
const replay = runCliJson(tempWorkspace, ['traces', 'replay', workflowRun.traceId])
const rerun = runCliJson(tempWorkspace, ['traces', 'rerun', workflowRun.traceId])
const evalReport = runCliJson(rootDir, ['evals', 'run', 'canonical'])
const longitudinalReport = runCliJson(rootDir, ['evals', 'run', 'longitudinal'])

const debugBundle = {
  generatedAt: new Date().toISOString(),
  canonicalScenarioId: 'crm.roundtrip',
  workspace,
  workflowRun,
  approval,
  trace,
  replay,
  rerun
}

writeFileSync(path.join(outDir, 'canonical-eval.json'), JSON.stringify(evalReport, null, 2))
writeFileSync(path.join(outDir, 'canonical-eval.md'), renderEvalMarkdown(evalReport))
writeFileSync(path.join(outDir, 'longitudinal-eval.json'), JSON.stringify(longitudinalReport, null, 2))
writeFileSync(path.join(outDir, 'longitudinal-eval.md'), renderEvalMarkdown(longitudinalReport))
writeFileSync(path.join(outDir, 'canonical-debug-bundle.json'), JSON.stringify(debugBundle, null, 2))
writeFileSync(path.join(outDir, 'canonical-debug-bundle.md'), renderDebugMarkdown(debugBundle))

console.log(`Wrote CI artifacts to ${outDir}`)
