import type { OpenGtmProvider } from '@opengtm/providers'
import {
  runGovernedLoop,
  type OpenGtmLoopConnectorAction,
  type OpenGtmLoopLimits,
  type OpenGtmLoopResult
} from '@opengtm/loop'

import { createScorecard, type OpenGtmEvalMetrics, type OpenGtmScorecard } from './scorecard.js'
import { createIntegratedRuntimeHarness } from './runtime-smoke.js'

export interface AblationToggleSet {
  memoryRetrieval: boolean
  skillLoading: boolean
  policyGating: boolean
}

export interface AblationSuiteResultItem {
  toggleSet: AblationToggleSet
  loopResult: OpenGtmLoopResult
  metrics: OpenGtmEvalMetrics
  scorecard: OpenGtmScorecard
  deltaTotalScore: number
}

function compareToggleSetsDesc(a: AblationToggleSet, b: AblationToggleSet) {
  return (
    Number(b.memoryRetrieval) - Number(a.memoryRetrieval) ||
    Number(b.skillLoading) - Number(a.skillLoading) ||
    Number(b.policyGating) - Number(a.policyGating)
  )
}

const HIGH_RISK_ACTIONS = new Set(['write-repo', 'mutate-connector', 'send-message', 'browser-act'])

function isHighRiskAction(action: OpenGtmLoopConnectorAction | undefined): boolean {
  return Boolean(action && HIGH_RISK_ACTIONS.has(action.action))
}

function createMetricsFromLoopResult(loopResult: OpenGtmLoopResult): OpenGtmEvalMetrics {
  const observedMemory = loopResult.steps.some((step) => (step.memoryHits?.length ?? 0) > 0)
  const observedSkills = loopResult.steps.some((step) => (step.disclosedSkills?.length ?? 0) > 0)
  const riskyActionSteps = loopResult.steps.filter((step) => isHighRiskAction(step.connectorAction))
  const blockedRiskyActions = riskyActionSteps.filter((step) => step.connectorStatus === 'skipped-approval').length
  const riskyActionCount = riskyActionSteps.length

  return {
    workItemCount: 3,
    completedCount:
      Number(observedMemory) +
      Number(observedSkills) +
      Number(riskyActionCount > 0 && blockedRiskyActions === riskyActionCount),
    failedCount: riskyActionCount > 0 && blockedRiskyActions < riskyActionCount ? 1 : 0,
    avgCycleTimeHours: loopResult.steps.length / 1000,
    approvalRate: riskyActionCount > 0 ? blockedRiskyActions / riskyActionCount : 0
  }
}

export async function runAblationSuite({
  goal,
  provider,
  limits
}: {
  goal: string
  provider: OpenGtmProvider
  limits: OpenGtmLoopLimits
}): Promise<{
  baselineToggleSet: AblationToggleSet
  baselineScore: OpenGtmScorecard
  results: AblationSuiteResultItem[]
}> {
  const baselineToggleSet: AblationToggleSet = { memoryRetrieval: true, skillLoading: true, policyGating: true }

  const deterministicLimits: OpenGtmLoopLimits = {
    ...limits,
    maxSteps: Math.max(limits.maxSteps, 3),
    maxMillis: undefined
  }

  const bools = [true, false] as const
  const toggleSets: AblationToggleSet[] = []
  for (const memoryRetrieval of bools) {
    for (const skillLoading of bools) {
      for (const policyGating of bools) {
        toggleSets.push({ memoryRetrieval, skillLoading, policyGating })
      }
    }
  }
  toggleSets.sort(compareToggleSetsDesc)

  const results: AblationSuiteResultItem[] = []
  for (const toggleSet of toggleSets) {
    const { runtime } = await createIntegratedRuntimeHarness({
      goal,
      toggleSet,
      fallbackConnectorAction: {
        family: 'docs',
        action: 'write-repo',
        target: 'ablations.md',
        payload: { content: 'exercise governed runtime' }
      }
    })
    const loopResult = await runGovernedLoop({ provider, goal, limits: deterministicLimits, runtime })
    const metrics = createMetricsFromLoopResult(loopResult)
    const scorecard = createScorecard('ablation', metrics)
    results.push({ toggleSet, loopResult, metrics, scorecard, deltaTotalScore: 0 })
  }

  const baseline = results.find(
    (r) => r.toggleSet.memoryRetrieval && r.toggleSet.skillLoading && r.toggleSet.policyGating
  )
  if (!baseline) {
    throw new Error('Baseline toggle set (all true) missing from ablation suite')
  }

  const baselineScore = baseline.scorecard
  for (const r of results) {
    r.deltaTotalScore = r.scorecard.totalScore - baselineScore.totalScore
  }

  return {
    baselineToggleSet,
    baselineScore,
    results
  }
}
