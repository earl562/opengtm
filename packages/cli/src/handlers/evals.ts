import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAblationSuite, runIntegratedRuntimeSmokeHarness } from '@opengtm/evals'
import { createLocalDaemon } from '@opengtm/daemon'
import { createMockProvider } from '@opengtm/providers'
import { listRecords } from '@opengtm/storage'
import { listCanonicalActivities, resolveCanonicalCrmDbFile } from '../canonical-crm.js'
import { handleApprovals } from './approvals.js'
import { handleOpenGtmSmoke } from './opengtm.js'
import { handleTraces } from './traces.js'
import { handleWorkflowRun } from './workflows.js'

export async function handleEvals(args: {
  suite?: string
}): Promise<Record<string, unknown>> {
  const suite = args.suite || 'smoke'

  if (suite === 'smoke') {
    const summary = await handleOpenGtmSmoke()
    return {
      suite,
      ...summary
    }
  }

  if (suite === 'runtime') {
    const scenarios = await runIntegratedRuntimeSmokeHarness()
    return {
      suite,
      scenarioCount: scenarios.length,
      scenarios: scenarios.map((scenario) => ({
        name: scenario.name,
        status: scenario.loopResult.status,
        connectorStatus: scenario.loopResult.steps.at(-1)?.connectorStatus ?? null,
        approvalCount: scenario.loopResult.approvalRequests?.length ?? 0
      }))
    }
  }

  if (suite === 'ablations') {
    const provider = createMockProvider({ seed: 'public-release' })
    const result = await runAblationSuite({
      goal: 'research this lead for Acme',
      provider,
      limits: { maxSteps: 3 }
    })
    return {
      suite,
      baselineToggleSet: result.baselineToggleSet,
      baselineScore: result.baselineScore.totalScore,
      results: result.results.map((item) => ({
        toggleSet: item.toggleSet,
        deltaTotalScore: item.deltaTotalScore,
        status: item.loopResult.status,
        approvalsRequested: item.loopResult.approvalsRequested ?? 0,
        errorCount: item.loopResult.errorCount ?? 0
      }))
    }
  }

  if (suite === 'canonical') {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-canonical-eval-'))
    const daemon = createLocalDaemon({ rootDir })

    const pending = await handleWorkflowRun({
      daemon,
      workflowId: 'crm.roundtrip',
      goal: 'Canonical Eval Lead',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })
    const approved = await handleApprovals({
      daemon,
      action: 'approve',
      id: pending.approvalRequestId!
    })
    if (!approved.trace?.id) {
      throw new Error('Canonical eval approve path did not return a trace id')
    }

    const deniedPending = await handleWorkflowRun({
      daemon,
      workflowId: 'crm.roundtrip',
      goal: 'Canonical Deny Lead',
      workspaceId: 'w1',
      initiativeId: 'i1'
    })
    await handleApprovals({
      daemon,
      action: 'deny',
      id: deniedPending.approvalRequestId!
    })

    const replay = await handleTraces({
      daemon,
      action: 'replay',
      id: approved.trace.id,
      workspaceId: 'w1',
      initiativeId: 'i1'
    })
    const rerun = await handleTraces({
      daemon,
      action: 'rerun',
      id: approved.trace.id,
      workspaceId: 'w1',
      initiativeId: 'i1'
    })
    const smoke = await runIntegratedRuntimeSmokeHarness()
    const provider = createMockProvider({ seed: 'canonical-eval' })
    const ablations = await runAblationSuite({
      goal: 'research this lead for Acme',
      provider,
      limits: { maxSteps: 3 }
    })

    const traces = listRecords<any>(daemon.storage, 'run_traces')
    const approvals = listRecords<any>(daemon.storage, 'approval_requests')
    const feedback = listRecords<any>(daemon.storage, 'feedback_records')
    const artifacts = listRecords<any>(daemon.storage, 'artifacts')
    const activities = listCanonicalActivities(resolveCanonicalCrmDbFile(rootDir))

    const approvedTrace = traces.find((trace) => trace.id === approved.trace.id)
    const deniedTrace = traces.find((trace) => trace.workflowId === 'crm.roundtrip' && trace.status === 'cancelled')
    const contextScenario = smoke.find((scenario) => scenario.name === 'context-budget-omits-optional-sections')
    const policyOff = ablations.results.find((item) => item.toggleSet.policyGating === false)
    const skillOff = ablations.results.find((item) => item.toggleSet.memoryRetrieval === true && item.toggleSet.skillLoading === false && item.toggleSet.policyGating === true)

    const dimensions = {
      transferability:
        pending.supportTier === 'live' &&
        'workflowState' in rerun &&
        rerun.workflowState === 'awaiting-approval'
          ? 90
          : 40,
      maintainability:
        pending.isCanonical &&
        traces.some((trace) => trace.observedFacts?.some((fact: any) => fact.kind === 'truthfulness'))
          ? 88
          : 45,
      recoveryRobustness:
        Boolean(deniedTrace?.observedFacts?.some((fact: any) => fact.kind === 'recovery-semantics')) &&
        'mode' in replay &&
        replay.mode === 'deterministic-replay'
          ? 90
          : 35,
      contextEfficiency:
        Boolean(contextScenario?.loopResult.steps[0]?.omittedPromptSections?.length)
          ? 92
          : 30,
      governanceQuality:
        approvals.length >= 2 &&
        feedback.length >= 2 &&
        activities.length >= 2 &&
        Boolean(artifacts.find((artifact) => artifact.title?.includes('Canonical checkpoint')))
          ? 94
          : 35
    }

    const thresholds = {
      transferability: 80,
      maintainability: 80,
      recoveryRobustness: 80,
      contextEfficiency: 80,
      governanceQuality: 85
    }

    const expectedMinimumDeltas = {
      policyGatingOff: -10,
      skillLoadingOff: -5
    }

    const passes = Object.entries(thresholds).every(([key, threshold]) => dimensions[key as keyof typeof dimensions] >= threshold)
      && Boolean((policyOff?.deltaTotalScore ?? 0) <= expectedMinimumDeltas.policyGatingOff)
      && Boolean((skillOff?.deltaTotalScore ?? 0) <= expectedMinimumDeltas.skillLoadingOff)

    return {
      suite,
      canonicalScenarioId: 'crm.roundtrip',
      pass: passes,
      thresholds,
      dimensions,
      expectedMinimumDeltas,
      observedDeltas: {
        policyGatingOff: policyOff?.deltaTotalScore ?? null,
        skillLoadingOff: skillOff?.deltaTotalScore ?? null
      },
      evidence: {
        pendingTraceId: pending.traceId,
        approvedTraceId: approved.trace.id,
        rerunTraceId: 'traceId' in rerun ? rerun.traceId : null,
        approvalCount: approvals.length,
        feedbackCount: feedback.length,
        activityCount: activities.length,
        contextBudgetOmissions: contextScenario?.loopResult.steps[0]?.omittedPromptSections ?? []
      }
    }
  }

  if (suite === 'longitudinal') {
    const rootDir = mkdtempSync(join(tmpdir(), 'opengtm-longitudinal-eval-'))
    const daemon = createLocalDaemon({ rootDir })
    const runs: Array<Record<string, unknown>> = []

    for (let i = 0; i < 3; i++) {
      const workflow = await handleWorkflowRun({
        daemon,
        workflowId: 'crm.roundtrip',
        goal: `Longitudinal Lead ${i + 1}`,
        workspaceId: 'w1',
        initiativeId: 'i1'
      })
      const approval = await handleApprovals({
        daemon,
        action: 'approve',
        id: workflow.approvalRequestId!
      })
      const replay = await handleTraces({
        daemon,
        action: 'replay',
        id: workflow.traceId!,
        workspaceId: 'w1',
        initiativeId: 'i1'
      })
      const rerun = await handleTraces({
        daemon,
        action: 'rerun',
        id: workflow.traceId!,
        workspaceId: 'w1',
        initiativeId: 'i1'
      })

      runs.push({
        workflowState: workflow.workflowState,
        approvalState: (approval.summary as any)?.approvalState ?? null,
        replayMode: 'mode' in replay ? replay.mode : null,
        rerunState: 'workflowState' in rerun ? rerun.workflowState : null
      })
    }

    const activities = listCanonicalActivities(resolveCanonicalCrmDbFile(rootDir))
    const successRate = runs.filter((run) => run.approvalState === 'approved').length / runs.length
    const replayConsistency = runs.filter((run) => run.replayMode === 'deterministic-replay').length / runs.length
    const rerunContinuity = runs.filter((run) => run.rerunState === 'awaiting-approval').length / runs.length
    const activityContinuity = activities.length / runs.length

    const dimensions = {
      successRate: Math.round(successRate * 100),
      replayConsistency: Math.round(replayConsistency * 100),
      rerunContinuity: Math.round(rerunContinuity * 100),
      activityContinuity: Math.round(activityContinuity * 100)
    }

    const thresholds = {
      successRate: 100,
      replayConsistency: 100,
      rerunContinuity: 100,
      activityContinuity: 100
    }

    return {
      suite,
      canonicalScenarioId: 'crm.roundtrip',
      pass: Object.entries(thresholds).every(([key, threshold]) => dimensions[key as keyof typeof dimensions] >= threshold),
      thresholds,
      dimensions,
      observedDeltas: {},
      evidence: {
        runCount: runs.length,
        activityCount: activities.length,
        runs
      }
    }
  }

  throw new Error(`Unknown OpenGTM eval suite: ${suite}`)
}
