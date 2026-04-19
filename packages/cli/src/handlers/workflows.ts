import {
  createWorkflow,
  createWorkflowRun,
  transitionWorkflowRun
} from '@opengtm/core'
import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import type {
  OpenGtmWorkflowManifest,
  OpenGtmWorkflowRun,
  OpenGtmWorkflowRunResult
} from '@opengtm/types'
import type { OpenGtmAutonomyMode } from '../autonomy.js'
import { handleCanonicalCrmRoundtripRun } from './canonical.js'
import { handleBuildRun } from './build.js'
import { handleLiveLeadResearchWorkflow, handleLiveOutreachComposeWorkflow } from './live-workflows.js'
import { handleOpsRun } from './ops.js'
import { handleResearchRun } from './research.js'
import {
  getReferenceWorkflow,
  listReferenceWorkflows,
  OPEN_GTM_CANONICAL_SCENARIO_ID,
  OPEN_GTM_CANONICAL_SCENARIO_LABEL
} from '../workflows.js'

function resolveWorkflowState(result: {
  traceStatus?: string
  summary?: { workflowState?: string }
}): OpenGtmWorkflowRun['status'] {
  const state = result.summary?.workflowState || result.traceStatus || 'running'
  if (state === 'awaiting-approval') return 'awaiting-approval'
  if (state === 'completed') return 'completed'
  if (state === 'cancelled') return 'cancelled'
  if (state === 'failed') return 'failed'
  return 'running'
}

function normalizeWorkflowResult(args: {
  manifest: OpenGtmWorkflowManifest
  workflowRunId: string
  result: any
}): OpenGtmWorkflowRunResult {
  const summary = args.result.summary ?? {}
  return {
    workflowId: args.manifest.id,
    workflowRunId: args.workflowRunId,
    lane: args.manifest.lane,
    workflowState: summary.workflowState || args.result.traceStatus || 'running',
    persona: args.manifest.persona,
    fixtureSetId: args.manifest.fixtureSetId,
    supportTier: args.manifest.supportTier,
    isCanonical: args.manifest.isCanonical,
    canonicalScenarioId: args.manifest.isCanonical ? OPEN_GTM_CANONICAL_SCENARIO_ID : null,
    traceId: args.result.traceId || summary.traceRef || null,
    logFilePath: args.result.logFilePath || null,
    approvalRequestId: args.result.approvalRequestId || null,
    artifactId: args.result.artifactId || args.result.artifact?.id || null,
    artifactPath: args.result.artifactPath || args.result.artifact?.path || null,
    nextAction: args.manifest.supportTier === 'reference-only'
      ? 'This workflow remains reference-only while the canonical CRM roundtrip slice is hardened. Review its artifacts as scaffolding, not as the claim-bearing public path.'
      : args.result.nextAction || summary.nextAction || 'Review the workflow artifacts and continue the operator flow.'
  }
}

export async function handleWorkflowCatalog() {
  const workflows = listReferenceWorkflows()
  return {
    workflows,
    summary: {
      total: workflows.length,
      byLane: workflows.reduce<Record<string, number>>((summary, workflow) => {
        summary[workflow.lane] = (summary[workflow.lane] || 0) + 1
        return summary
      }, {}),
      bySupportTier: workflows.reduce<Record<string, number>>((summary, workflow) => {
        summary[workflow.supportTier] = (summary[workflow.supportTier] || 0) + 1
        return summary
      }, {}),
      canonicalScenarioId: OPEN_GTM_CANONICAL_SCENARIO_ID,
      canonicalScenarioLabel: OPEN_GTM_CANONICAL_SCENARIO_LABEL
    }
  }
}

export async function handleWorkflowRun(args: {
  daemon: OpenGtmLocalDaemon
  workflowId: string
  goal?: string
  workspaceId?: string
  initiativeId?: string
  autonomyMode?: OpenGtmAutonomyMode
}) {
  const workflow = getReferenceWorkflow(args.workflowId)
  if (!workflow) {
    throw new Error(`Unknown OpenGTM workflow: ${args.workflowId}`)
  }

  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const persistedWorkflow = createWorkflow({
    id: workflow.id,
    workspaceId,
    name: workflow.name,
    description: workflow.description,
    trigger: workflow.trigger,
    lane: workflow.lane,
    status: 'enabled'
  })
  const workflowRun = createWorkflowRun({
    workflowId: persistedWorkflow.id,
    status: 'running',
    input: {
      goal: args.goal || workflow.name,
      fixtureSetId: workflow.fixtureSetId
    }
  })

  const { upsertRecord } = await import('@opengtm/storage')
  upsertRecord(args.daemon.storage, 'workflows', persistedWorkflow)
  upsertRecord(args.daemon.storage, 'workflow_runs', workflowRun)

  const goal = args.goal || workflow.description
  let rawResult: any
  if (workflow.id === OPEN_GTM_CANONICAL_SCENARIO_ID) {
    rawResult = await handleCanonicalCrmRoundtripRun({
      daemon: args.daemon,
      workflowId: workflow.id,
      workflowRunId: workflowRun.id,
      goal,
      workspaceId,
      initiativeId: args.initiativeId,
      persona: workflow.persona,
      fixtureSetId: workflow.fixtureSetId
    })
  } else if (workflow.id === 'sdr.lead_research') {
    rawResult = await handleLiveLeadResearchWorkflow({
      daemon: args.daemon,
      workflowId: workflow.id,
      workflowRunId: workflowRun.id,
      goal,
      workspaceId,
      initiativeId: args.initiativeId,
      persona: workflow.persona,
      fixtureSetId: workflow.fixtureSetId
    })
  } else if (workflow.id === 'sdr.outreach_compose') {
    rawResult = await handleLiveOutreachComposeWorkflow({
      daemon: args.daemon,
      workflowId: workflow.id,
      workflowRunId: workflowRun.id,
      goal,
      workspaceId,
      initiativeId: args.initiativeId,
      persona: workflow.persona,
      fixtureSetId: workflow.fixtureSetId
    })
  } else if (workflow.lane === 'research') {
    rawResult = await handleResearchRun({
      daemon: args.daemon,
      goal,
      workspaceId,
      initiativeId: args.initiativeId,
      autonomyMode: args.autonomyMode,
      workflowId: workflow.id,
      workflowRunId: workflowRun.id,
      persona: workflow.persona,
      fixtureSetId: workflow.fixtureSetId
    })
  } else if (workflow.lane === 'build-integrate') {
    rawResult = await handleBuildRun({
      daemon: args.daemon,
      goal,
      workspaceId,
      initiativeId: args.initiativeId,
      autonomyMode: args.autonomyMode,
      workflowId: workflow.id,
      workflowRunId: workflowRun.id,
      persona: workflow.persona,
      fixtureSetId: workflow.fixtureSetId
    })
  } else {
    rawResult = await handleOpsRun({
      daemon: args.daemon,
      goal,
      workspaceId,
      initiativeId: args.initiativeId,
      autonomyMode: args.autonomyMode,
      workflowId: workflow.id,
      workflowRunId: workflowRun.id,
      persona: workflow.persona,
      fixtureSetId: workflow.fixtureSetId,
      requiresApproval: workflow.requiresApproval
    })
  }

  const nextStatus = resolveWorkflowState(rawResult)
  const finalizedRun = nextStatus === workflowRun.status
    ? workflowRun
    : transitionWorkflowRun(workflowRun, nextStatus)

  const workflowResult = normalizeWorkflowResult({
    manifest: workflow,
    workflowRunId: finalizedRun.id,
    result: rawResult
  })

  const storedWorkflowRun: OpenGtmWorkflowRun = {
    ...finalizedRun,
    output: workflowResult as unknown as Record<string, unknown>,
    error: nextStatus === 'failed' ? workflowResult.nextAction : null
  }

  upsertRecord(args.daemon.storage, 'workflow_runs', storedWorkflowRun)

  return {
    workflow,
    workflowRun: {
      id: finalizedRun.id,
      status: finalizedRun.status
    },
    ...workflowResult
  }
}
