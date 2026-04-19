import {
  createArtifactRecord,
  createRunTrace,
  transitionApprovalRequest,
  transitionWorkItem,
  updateRunTrace
} from '@opengtm/core'
import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { createJsonlRunLogger } from '@opengtm/observability'
import {
  createApprovalRequestForDecision,
  createPolicyDecisionFromActionWithConfig,
  loadPolicyConfig
} from '@opengtm/policy'
import type {
  OpenGtmApprovalRequest,
  OpenGtmRunTrace,
  OpenGtmWorkItem
} from '@opengtm/types'
import type { OpenGtmAutonomyMode } from '../autonomy.js'
import { createCanonicalActivity, parseCanonicalConnectorTargets } from '../canonical-crm.js'

const OPS_LOCAL_SUPPORT_TIER = 'live'

function createOpsArtifactPayload(args: {
  workItem: OpenGtmWorkItem
  traceId: string
  persona: string | null
  workflowId: string | null
  executionMode: string
  approvalStatus?: string
  supportTier?: string
  canonicalScenarioId?: string | null
  crmActivityId?: string | null
}) {
  return {
    lane: args.workItem.ownerLane,
    workItemId: args.workItem.id,
    workflowId: args.workflowId,
    goal: args.workItem.goal,
    persona: args.persona,
    traceId: args.traceId,
    executionMode: args.executionMode,
    approvalStatus: args.approvalStatus || null,
    supportTier: args.supportTier || OPS_LOCAL_SUPPORT_TIER,
    canonicalScenarioId: args.canonicalScenarioId || null,
    crmActivityId: args.crmActivityId || null,
    summary: `Prepared ${args.workItem.goal} for ${args.persona || 'operator'}`
  }
}

export async function continueApprovedOpsWorkflow(args: {
  daemon: OpenGtmLocalDaemon
  approval: OpenGtmApprovalRequest
  workItem: OpenGtmWorkItem
  trace: OpenGtmRunTrace
}) {
  const startedAtMs = Date.now()
  const logger = createJsonlRunLogger({
    rootDir: args.daemon.storage.rootDir,
    runId: args.trace.id,
    traceId: args.trace.id
  })
  const { upsertRecord, writeArtifactBlob } = await import('@opengtm/storage')

  const queuedWorkItem = args.workItem.status === 'queued'
    ? args.workItem
    : transitionWorkItem(args.workItem, 'queued')
  const runningWorkItem = transitionWorkItem(queuedWorkItem, 'running')
  const runningTrace = updateRunTrace(args.trace, {
    status: 'running',
    steps: [
      { name: 'load-context', status: 'completed' },
      { name: 'prepare-action', status: 'completed' },
      { name: 'approve-or-send', status: 'running' },
      { name: 'record-outcome', status: 'pending' }
    ]
  })

  upsertRecord(args.daemon.storage, 'work_items', runningWorkItem)
  upsertRecord(args.daemon.storage, 'run_traces', runningTrace)

  const artifact = createArtifactRecord({
    workspaceId: args.workItem.workspaceId,
    initiativeId: args.workItem.initiativeId,
    kind: 'campaign-brief',
    lane: args.workItem.ownerLane,
    title: `Ops execution: ${args.workItem.goal}`,
    provenance: [
      'opengtm:ops-approval-resume',
      `approval:${args.approval.id}`,
      `support-tier:${OPS_LOCAL_SUPPORT_TIER}`
    ],
    traceRef: runningTrace.id
  })

  let crmActivityId: string | null = null
  const canonicalContext = parseCanonicalConnectorTargets(args.workItem.connectorTargets)

  if (canonicalContext.dbFile && canonicalContext.leadId) {
    const crmActivity = createCanonicalActivity(canonicalContext.dbFile, {
      subject: `Approved outreach draft for ${args.workItem.goal}`,
      type: 'email',
      relatedType: 'lead',
      relatedId: canonicalContext.leadId
    })
    crmActivityId = crmActivity.id
  }

  const artifactPath = writeArtifactBlob(args.daemon.storage, {
    workspaceSlug: 'global',
    artifactId: artifact.id,
    content: createOpsArtifactPayload({
      workItem: args.workItem,
      traceId: runningTrace.id,
      persona: runningTrace.persona,
      workflowId: runningTrace.workflowId,
      executionMode: 'approved-resume',
      approvalStatus: args.approval.status,
      supportTier: OPS_LOCAL_SUPPORT_TIER,
      canonicalScenarioId: runningTrace.workflowId === 'crm.roundtrip' ? 'crm.roundtrip' : null,
      crmActivityId
    })
  })

  const storedArtifact = {
    ...artifact,
    contentRef: artifactPath,
    sourceIds: [args.approval.id]
  }

  upsertRecord(args.daemon.storage, 'artifacts', storedArtifact)

  const completedWorkItem = transitionWorkItem(runningWorkItem, 'completed')
  const completedTrace = updateRunTrace(runningTrace, {
    status: 'completed',
    connectorCalls: crmActivityId
      ? [
          ...runningTrace.connectorCalls,
          {
            provider: 'opengtm-crm',
            family: 'crm',
            action: 'mutate-connector',
            target: 'activities',
            executionMode: 'live',
            supportTier: OPS_LOCAL_SUPPORT_TIER,
            crmActivityId
          }
        ]
      : runningTrace.connectorCalls,
    observedFacts: [
      {
        kind: 'truthfulness',
        scope: 'ops-approval-resume',
        supportTier: OPS_LOCAL_SUPPORT_TIER,
        approvalRequestId: args.approval.id,
        checkpointId: canonicalContext.checkpointId,
        crmActivityId
      },
      {
        kind: 'recovery-semantics',
        scope: 'ops-approval-resume',
        reversibleEffects: ['research-artifact', 'approval-artifact'],
        resumableEffects: ['approval-gate', 'draft-review'],
        operatorInterventionRequired: crmActivityId ? ['crm-activity-log'] : [],
        rollbackOutcome: crmActivityId ? 'operator-intervention-required' : 'not-invoked'
      }
    ],
    steps: [
      { name: 'load-context', status: 'completed' },
      { name: 'prepare-action', status: 'completed' },
      { name: 'approve-or-send', status: 'completed' },
      { name: 'record-outcome', status: 'completed' }
    ],
    artifactIds: [...runningTrace.artifactIds, storedArtifact.id],
    endedAt: new Date().toISOString()
  })

  upsertRecord(args.daemon.storage, 'work_items', completedWorkItem)
  upsertRecord(args.daemon.storage, 'run_traces', completedTrace)

  logger.finalize({
    status: 'completed',
    durationMs: Date.now() - startedAtMs,
    approvalRequestId: args.approval.id,
    artifactId: storedArtifact.id
  })

  return {
    workItem: completedWorkItem,
    trace: completedTrace,
    artifact: storedArtifact,
    artifactPath
  }
}

export async function handleOpsRun(args: {
  daemon: OpenGtmLocalDaemon
  goal: string
  workspaceId?: string
  initiativeId?: string
  autonomyMode?: OpenGtmAutonomyMode
  workflowId?: string | null
  workflowRunId?: string | null
  persona?: string | null
  fixtureSetId?: string | null
  requiresApproval?: boolean
  sourceIds?: string[]
  connectorTargets?: string[]
  supportTier?: string
  canonicalScenarioId?: string | null
}) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const workItem = args.daemon.createWorkItem({
    workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    workflowId: args.workflowId || null,
    workflowRunId: args.workflowRunId || null,
    ownerLane: 'ops-automate',
    title: `Ops: ${args.goal}`,
    goal: args.goal,
    status: args.autonomyMode === 'background' ? 'queued' : (args.requiresApproval ? 'awaiting-approval' : 'running'),
    sourceIds: args.sourceIds || [],
    connectorTargets: args.connectorTargets || []
  })

  const baseSteps = [
    { name: 'load-context', status: args.autonomyMode === 'background' ? 'queued' : 'completed' },
    { name: 'prepare-action', status: args.autonomyMode === 'background' ? 'queued' : 'completed' },
    { name: 'approve-or-send', status: args.autonomyMode === 'background' ? 'queued' : (args.requiresApproval ? 'awaiting-approval' : 'completed') },
    { name: 'record-outcome', status: args.autonomyMode === 'background' ? 'queued' : (args.requiresApproval ? 'pending' : 'completed') }
  ]

  const trace = createRunTrace({
    workItemId: workItem.id,
    workflowId: workItem.workflowId,
    lane: 'ops-automate',
    persona: args.persona || null,
    fixtureSetId: args.fixtureSetId || null,
    status: args.autonomyMode === 'background' ? 'queued' : (args.requiresApproval ? 'awaiting-approval' : 'completed'),
    steps: baseSteps
  })

  const logger = createJsonlRunLogger({
    rootDir: args.daemon.storage.rootDir,
    runId: trace.id,
    traceId: trace.id
  })
  const traceWithLog = updateRunTrace(trace, {
    logFilePath: logger.logFilePath,
    debugBundlePath: logger.logFilePath,
    observedFacts: [
      {
        kind: 'truthfulness',
        scope: 'ops-run',
        supportTier: args.supportTier || OPS_LOCAL_SUPPORT_TIER,
        canonicalScenarioId: args.canonicalScenarioId || null,
        checkpointId: args.connectorTargets?.find((item) => item.startsWith('checkpoint:'))?.slice('checkpoint:'.length) || null
      }
    ]
  })

  const { upsertRecord, writeArtifactBlob } = await import('@opengtm/storage')
  upsertRecord(args.daemon.storage, 'work_items', workItem)
  upsertRecord(args.daemon.storage, 'run_traces', traceWithLog)

  if (args.autonomyMode === 'background') {
    return {
      workItem,
      traceId: traceWithLog.id,
      traceStatus: traceWithLog.status,
      logFilePath: traceWithLog.logFilePath,
      summary: {
        lane: workItem.ownerLane,
        workflowState: traceWithLog.status,
        autonomyMode: 'background',
        nextAction: 'Background autonomy queued the ops workflow. Resume it from the approval queue or daemon path.'
      }
    }
  }

  logger.log('run.start', {
    lane: workItem.ownerLane,
    goal: args.goal,
    workItemId: workItem.id,
    traceId: traceWithLog.id,
    workflowId: workItem.workflowId,
    logFilePath: logger.logFilePath
  })

  const artifact = createArtifactRecord({
    workspaceId,
    initiativeId: workItem.initiativeId,
    kind: args.requiresApproval ? 'approval' : 'campaign-brief',
    lane: workItem.ownerLane,
    title: `Ops draft: ${args.goal}`,
    provenance: ['opengtm:ops-run', `support-tier:${OPS_LOCAL_SUPPORT_TIER}`],
    traceRef: traceWithLog.id
  })
  const artifactPath = writeArtifactBlob(args.daemon.storage, {
    workspaceSlug: 'global',
    artifactId: artifact.id,
    content: createOpsArtifactPayload({
      workItem,
      traceId: traceWithLog.id,
      persona: args.persona || null,
      workflowId: workItem.workflowId,
      executionMode: args.requiresApproval ? 'awaiting-approval' : 'completed'
      ,
      supportTier: args.supportTier || OPS_LOCAL_SUPPORT_TIER,
      canonicalScenarioId: args.canonicalScenarioId || null
    })
  })
  const storedArtifact = {
    ...artifact,
    contentRef: artifactPath,
    sourceIds: []
  }
  upsertRecord(args.daemon.storage, 'artifacts', storedArtifact)

  if (args.requiresApproval) {
    const policyConfig = await loadPolicyConfig({ cwd: process.cwd() })
    const decision = createPolicyDecisionFromActionWithConfig({
      workItemId: workItem.id,
      lane: 'ops-automate',
      actionType: 'send-message',
      target: args.goal
    }, policyConfig)
    const approval = createApprovalRequestForDecision({
      workspaceId,
      decision,
      actionSummary: `Ops action requires approval: ${args.goal}`
    })

    upsertRecord(args.daemon.storage, 'policy_decisions', decision)
    upsertRecord(args.daemon.storage, 'approval_requests', approval)

    logger.log('approval.created', {
      approvalRequestId: approval.id,
      policyDecisionId: decision.id
    })
    logger.finalize({
      status: traceWithLog.status,
      approvalRequestId: approval.id
    })

    return {
      workItem,
      approvalRequestId: approval.id,
      traceId: traceWithLog.id,
      traceStatus: traceWithLog.status,
      logFilePath: traceWithLog.logFilePath,
      artifactId: storedArtifact.id,
      artifactPath,
      summary: {
        lane: workItem.ownerLane,
        workflowState: traceWithLog.status,
        autonomyMode: args.autonomyMode ?? 'off',
        approvalState: approval.status,
        supportTier: args.supportTier || OPS_LOCAL_SUPPORT_TIER,
        traceRef: traceWithLog.id,
        nextAction: 'Review the draft artifact and approve the ops action before it can continue.'
      }
    }
  }

  logger.finalize({
    status: traceWithLog.status,
    durationMs: 0,
    artifactId: storedArtifact.id
  })

  const completedWorkItem = transitionWorkItem(workItem, 'completed')
  const completedTrace = updateRunTrace(traceWithLog, {
    status: 'completed',
    observedFacts: [
      {
        kind: 'truthfulness',
        scope: 'ops-run',
        supportTier: args.supportTier || OPS_LOCAL_SUPPORT_TIER,
        requiresApproval: Boolean(args.requiresApproval),
        canonicalScenarioId: args.canonicalScenarioId || null
      }
    ],
    endedAt: new Date().toISOString()
  })
  upsertRecord(args.daemon.storage, 'work_items', completedWorkItem)
  upsertRecord(args.daemon.storage, 'run_traces', completedTrace)

  return {
    workItem: completedWorkItem,
    traceId: completedTrace.id,
    traceStatus: completedTrace.status,
    logFilePath: completedTrace.logFilePath,
    artifactId: storedArtifact.id,
    artifactPath,
    summary: {
      lane: completedWorkItem.ownerLane,
      workflowState: completedTrace.status,
      autonomyMode: args.autonomyMode ?? 'off',
      supportTier: OPS_LOCAL_SUPPORT_TIER,
      traceRef: completedTrace.id,
      nextAction: 'Review the generated ops artifact and continue with operator validation.'
    }
  }
}
