import {
  createArtifactRecord,
  createRunTrace,
  transitionApprovalRequest,
  transitionWorkItem,
  updateRunTrace
} from '@opengtm/core'
import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { buildDefaultConnectorBundle, createContractForFamily } from '@opengtm/connectors'
import { runGovernedLoop, type OpenGtmLoopConnectorAction, type OpenGtmLoopResult } from '@opengtm/loop'
import { createContextBudget, createMemoryManager, createWorkingContext } from '@opengtm/memory'
import { createJsonlRunLogger } from '@opengtm/observability'
import {
  loadPolicyConfig
} from '@opengtm/policy'
import { createMockProvider, type OpenGtmProvider } from '@opengtm/providers'
import { createSkillRegistryV2, loadGtmSkillArtifacts } from '@opengtm/skills'
import type {
  OpenGtmApprovalRequest,
  OpenGtmRunTrace,
  OpenGtmWorkItem
} from '@opengtm/types'
import type { OpenGtmAutonomyMode } from '../autonomy.js'
import { collectCanonicalRuntimeEvidence, createCanonicalActivity, parseCanonicalConnectorTargets } from '../canonical-crm.js'
import { resolveWorkspaceProvider, resolveWorkspacePhaseProviders } from '../provider-runtime.js'
import { writeRecoveryArtifact } from '../recovery.js'

const OPS_LOCAL_SUPPORT_TIER = 'live'

interface OpenGtmOpsProviderResolution {
  providerId: string
  model: string
  authMode: 'none' | 'api-key' | 'oauth'
  configured: boolean
  provider: OpenGtmProvider
}

function createOpsLoopConnectorAction(args: {
  goal: string
  requiresApproval: boolean
  workflowId: string | null
}): OpenGtmLoopConnectorAction {
  return {
    family: 'email',
    action: 'send-message',
    target: args.goal,
    payload: {
      workflowId: args.workflowId,
      approvalMode: args.requiresApproval ? 'required' : 'auto'
    }
  }
}

function mapOpsLoopSteps(loopResult: OpenGtmLoopResult) {
  return loopResult.steps.map((step) => ({
    name: step.phase,
    status: step.error
      ? 'failed'
      : step.connectorStatus === 'failed'
        ? 'failed'
        : step.connectorStatus === 'skipped-approval'
          ? 'awaiting-approval'
          : 'completed',
    providerId: step.providerId || null,
    providerModel: step.providerModel || null,
    connectorStatus: step.connectorStatus || null,
    omittedPromptSections: step.omittedPromptSections || [],
    appliedReminderIds: step.appliedReminderIds || []
  }))
}

function summarizeOpsLoop(loopResult: OpenGtmLoopResult) {
  const reflectStep = [...loopResult.steps].reverse().find((step) => step.phase === 'reflect' && step.outputText?.trim())
  const lastTextStep = [...loopResult.steps].reverse().find((step) => step.outputText?.trim())
  return reflectStep?.outputText?.trim() || lastTextStep?.outputText?.trim() || 'No final ops draft was generated.'
}

function buildOpsConnectorCalls(args: {
  loopResult: OpenGtmLoopResult
  supportTier: string
}) {
  return args.loopResult.steps
    .filter((step) => step.connectorAction)
    .map((step) => ({
      provider: step.connectorResult?.provider || null,
      family: step.connectorResult?.family || step.connectorAction?.family || null,
      action: step.connectorResult?.action || step.connectorAction?.action || null,
      requestedAction: step.connectorResult?.requestedAction || step.connectorAction?.action || null,
      executionMode: step.connectorResult?.executionMode || (step.connectorStatus === 'skipped-approval' ? 'approval-required' : null),
      supportTier: args.supportTier,
      target: step.connectorResult?.target || step.connectorAction?.target || null,
      phase: step.phase,
      connectorStatus: step.connectorStatus || null
    }))
}

async function resolveOpsProvider(args: {
  cwd?: string
  goal: string
}): Promise<OpenGtmOpsProviderResolution> {
  if (!args.cwd) {
    return {
      providerId: 'mock',
      model: 'mock-0',
      authMode: 'none',
      configured: true,
      provider: createMockProvider({
        id: 'mock',
        seed: `opengtm:ops:${args.goal}`
      })
    }
  }

  const resolved = await resolveWorkspaceProvider(args.cwd)
  return resolved
}

function createOpsArtifactPayload(args: {
  workItem: OpenGtmWorkItem
  traceId: string
  persona: string | null
  workflowId: string | null
  executionMode: string
  approvalRequestId?: string | null
  approvalStatus?: string
  policyDecisionId?: string | null
  sourceArtifactIds?: string[]
  supportTier?: string
  canonicalScenarioId?: string | null
  crmActivityId?: string | null
  generation?: {
    providerId: string
    model: string
    configured: boolean
    authMode: string
    text: string
  } | null
}) {
  return {
    lane: args.workItem.ownerLane,
    workItemId: args.workItem.id,
    workflowId: args.workflowId,
    goal: args.workItem.goal,
    persona: args.persona,
    traceId: args.traceId,
    executionMode: args.executionMode,
    approvalRequestId: args.approvalRequestId || null,
    approvalStatus: args.approvalStatus || null,
    policyDecisionId: args.policyDecisionId || null,
    sourceArtifactIds: args.sourceArtifactIds || [],
    supportTier: args.supportTier || OPS_LOCAL_SUPPORT_TIER,
    canonicalScenarioId: args.canonicalScenarioId || null,
    crmActivityId: args.crmActivityId || null,
    summary: `Prepared ${args.workItem.goal} for ${args.persona || 'operator'}`,
    generation: args.generation || null
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
      approvalRequestId: args.approval.id,
      approvalStatus: args.approval.status,
      policyDecisionId: args.approval.decisionRef,
      sourceArtifactIds: args.trace.artifactIds,
      supportTier: OPS_LOCAL_SUPPORT_TIER,
      canonicalScenarioId: runningTrace.workflowId === 'crm.roundtrip' ? 'crm.roundtrip' : null,
      crmActivityId
    })
  })

  const storedArtifact = {
    ...artifact,
    contentRef: artifactPath,
    sourceIds: [args.approval.id, ...args.trace.artifactIds].filter(Boolean)
  }

  upsertRecord(args.daemon.storage, 'artifacts', storedArtifact)

  const completedWorkItem = transitionWorkItem(runningWorkItem, 'completed')
  const recoveryReport = writeRecoveryArtifact({
    storage: args.daemon.storage,
    workspaceId: args.workItem.workspaceId,
    initiativeId: args.workItem.initiativeId,
    lane: args.workItem.ownerLane,
    title: `Recovery report: ${args.workItem.goal}`,
    traceRef: runningTrace.id,
    sourceIds: [args.approval.id, storedArtifact.id],
    provenance: [
      'opengtm:recovery-report',
      `approval:${args.approval.id}`,
      'support-tier:live'
    ],
    checkpoint: canonicalContext.checkpointId
      ? {
          id: canonicalContext.checkpointId,
          createdAt: canonicalContext.checkpointCreatedAt || args.approval.createdAt
        }
      : null,
    payload: {
      decision: 'approved',
      canonicalScenarioId: runningTrace.workflowId,
      approvalRequestId: args.approval.id,
      policyDecisionId: args.approval.decisionRef,
      crmActivityId,
      sourceArtifactIds: args.trace.artifactIds,
      recoverySemantics: {
        reversibleEffects: ['research-artifact', 'approval-artifact'],
        resumableEffects: ['approval-gate', 'draft-review'],
        operatorInterventionRequired: crmActivityId ? ['crm-activity-log'] : []
      }
    }
  })
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
      ...runningTrace.observedFacts,
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
      },
      {
        kind: 'rollback-preview',
        scope: 'ops-approval-resume',
        artifactId: recoveryReport.artifact.id,
        candidateDeletionsByTable: recoveryReport.rollbackPreview?.candidateDeletionsByTable ?? {}
      }
    ],
    steps: [
      { name: 'load-context', status: 'completed' },
      { name: 'prepare-action', status: 'completed' },
      { name: 'approve-or-send', status: 'completed' },
      { name: 'record-outcome', status: 'completed' }
    ],
    artifactIds: [...runningTrace.artifactIds, storedArtifact.id, recoveryReport.artifact.id],
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
  cwd?: string
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
  const canonicalContext = parseCanonicalConnectorTargets(args.connectorTargets || [])
  const runtimeEvidence = canonicalContext.dbFile
    ? collectCanonicalRuntimeEvidence({
        dbFile: canonicalContext.dbFile,
        leadId: canonicalContext.leadId,
        accountId: canonicalContext.accountId,
        opportunityId: canonicalContext.opportunityId
      })
    : null
  const providerResolution = await resolveOpsProvider({
    cwd: args.cwd,
    goal: args.goal
  })
  const phaseProviderResolution = args.cwd
    ? await resolveWorkspacePhaseProviders(args.cwd)
    : null
  const workingContext = createWorkingContext()
  workingContext.set('goal', args.goal, { pinned: true })
  workingContext.set('lane', 'ops-automate', { pinned: true })
  workingContext.set('workflow_id', workItem.workflowId || 'lane-only', { pinned: true })
  workingContext.set('persona', args.persona || 'operator', { pinned: true })
  workingContext.set('provider', `${providerResolution.providerId}:${providerResolution.model}`, { pinned: true })
  workingContext.set('provider_configured', providerResolution.configured ? 'yes' : 'no', { pinned: true })
  if (phaseProviderResolution) {
    workingContext.set('phase_models', JSON.stringify(phaseProviderResolution.phaseModels), { pinned: true })
  }
  workingContext.set('requires_approval', String(Boolean(args.requiresApproval)), { pinned: true })
  workingContext.set('source_artifact_count', String((args.sourceIds || []).length), { pinned: true })
  if (canonicalContext.accountId) {
    workingContext.set('crm_account_id', canonicalContext.accountId, { pinned: true })
  }
  if (canonicalContext.leadId) {
    workingContext.set('crm_lead_id', canonicalContext.leadId, { pinned: true })
  }
  if (canonicalContext.opportunityId) {
    workingContext.set('crm_opportunity_id', canonicalContext.opportunityId, { pinned: true })
  }
  if (canonicalContext.checkpointId) {
    workingContext.set('checkpoint_id', canonicalContext.checkpointId, { pinned: true })
  }
  if (runtimeEvidence) {
    workingContext.set(
      'runtime_evidence',
      JSON.stringify({
        leadActivityCount: Array.isArray(runtimeEvidence.activities?.lead) ? runtimeEvidence.activities.lead.length : 0,
        accountActivityCount: Array.isArray(runtimeEvidence.activities?.account) ? runtimeEvidence.activities.account.length : 0,
        hasOpportunity: Boolean(runtimeEvidence.opportunity)
      }),
      { pinned: true }
    )
  }

  const opsLoopAction = createOpsLoopConnectorAction({
    goal: args.goal,
    requiresApproval: Boolean(args.requiresApproval),
    workflowId: workItem.workflowId
  })
  const connectorBundle = [
    ...buildDefaultConnectorBundle(),
    createContractForFamily({
      provider: 'mock-email',
      family: 'email'
    })
  ]
  const policyConfig = args.requiresApproval
    ? await loadPolicyConfig({ cwd: args.cwd || process.cwd() })
    : null
  const loopResult = await runGovernedLoop({
    provider: providerResolution.provider,
    goal: args.goal,
    limits: { maxSteps: 4, maxCostUsd: 5, maxMillis: 15000 },
    runtime: {
      workingContext,
      memory: {
        manager: createMemoryManager({ storage: args.daemon.storage }),
        workspaceId,
        scope: `initiative:${workItem.initiativeId}`,
        autoStoreOutputs: false
      },
      skills: {
        registry: createSkillRegistryV2(loadGtmSkillArtifacts()),
        disclosure: 'details',
        query: {
          persona: args.persona === 'SDR' || args.persona === 'AE' || args.persona === 'CS' || args.persona === 'DE'
            ? args.persona
            : undefined,
          tags: ['outbound', 'email']
        }
      },
      connectors: {
        bundle: connectorBundle,
        parser: () => opsLoopAction
      },
      policy: args.requiresApproval
        ? {
            workItemId: workItem.id,
            workspaceId,
            lane: 'ops-automate',
            config: policyConfig || undefined
          }
        : undefined,
      observability: { logger },
      phaseProviders: phaseProviderResolution?.phaseProviders || {
        default: providerResolution.provider
      },
      prompt: {
        systemReminders: [
          'Produce an operator-ready GTM draft that is grounded in available context and safe for review.',
          'When approval is required, stop at a reviewable draft and do not imply the message was actually sent.'
        ]
      },
      contextBudget: createContextBudget({
        maxTokens: 2400,
        warnThreshold: 0.65,
        flushThreshold: 0.85
      })
    }
  })
  if (loopResult.status === 'failed') {
    throw new Error(loopResult.failure?.message || 'Ops harness loop failed before producing an operator-ready draft.')
  }

  const generation = {
    providerId: providerResolution.providerId,
    model: providerResolution.model,
    configured: providerResolution.configured,
    authMode: providerResolution.authMode,
    text: summarizeOpsLoop(loopResult)
  }
  const artifactPath = writeArtifactBlob(args.daemon.storage, {
    workspaceSlug: 'global',
    artifactId: artifact.id,
    content: {
      ...createOpsArtifactPayload({
        workItem,
        traceId: traceWithLog.id,
        persona: args.persona || null,
        workflowId: workItem.workflowId,
        executionMode: args.requiresApproval ? 'awaiting-approval' : 'completed',
        supportTier: args.supportTier || OPS_LOCAL_SUPPORT_TIER,
        canonicalScenarioId: args.canonicalScenarioId || null,
        generation
      }),
      runtimeEvidence,
      harnessLoop: {
        status: loopResult.status,
        reason: loopResult.reason || null,
        totalCostUsd: loopResult.totalCostUsd,
        toggles: loopResult.toggles || null,
        steps: loopResult.steps.map((step) => ({
          phase: step.phase,
          providerId: step.providerId || null,
          providerModel: step.providerModel || null,
          connectorStatus: step.connectorStatus || null,
          connectorAction: step.connectorAction || null,
          appliedReminderIds: step.appliedReminderIds || [],
          omittedPromptSections: step.omittedPromptSections || [],
          budgetState: step.budgetState || null,
          error: step.error || null,
          outputText: step.outputText || null
        }))
      }
    }
  })
  const storedArtifact = {
    ...artifact,
    contentRef: artifactPath,
    sourceIds: args.sourceIds || []
  }
  upsertRecord(args.daemon.storage, 'artifacts', storedArtifact)

  if (args.requiresApproval) {
    const decision = loopResult.policyDecisions?.[0]
    const approval = loopResult.approvalRequests?.[0]
    if (!decision || !approval) {
      throw new Error('Ops harness did not produce the expected approval-gated action package.')
    }

    upsertRecord(args.daemon.storage, 'policy_decisions', decision)
    upsertRecord(args.daemon.storage, 'approval_requests', approval)
    const awaitingTrace = updateRunTrace(traceWithLog, {
      status: 'awaiting-approval',
      steps: mapOpsLoopSteps(loopResult),
      policyDecisionIds: [decision.id],
      artifactIds: [storedArtifact.id],
      connectorCalls: buildOpsConnectorCalls({
        loopResult,
        supportTier: args.supportTier || OPS_LOCAL_SUPPORT_TIER
      }),
      observedFacts: [
        ...traceWithLog.observedFacts,
        {
          kind: 'harness-loop',
          scope: 'ops-run',
          loopStatus: loopResult.status,
          loopReason: loopResult.reason || null,
          providerId: providerResolution.providerId,
          providerModel: providerResolution.model,
          phaseProviders: Array.from(new Set(loopResult.steps.map((step) => step.providerId).filter(Boolean))),
          phaseProviderModels: loopResult.steps.map((step) => `${step.phase}:${step.providerModel || 'unknown'}`),
          reminderIds: Array.from(new Set(loopResult.steps.flatMap((step) => step.appliedReminderIds || []))),
          omittedPromptSections: Array.from(new Set(loopResult.steps.flatMap((step) => step.omittedPromptSections || []))),
          totalCostUsd: loopResult.totalCostUsd,
          approvalsRequested: loopResult.approvalsRequested || 0,
          errorCount: loopResult.errorCount || 0
        }
      ]
    })
    upsertRecord(args.daemon.storage, 'run_traces', awaitingTrace)

    logger.log('approval.created', {
      approvalRequestId: approval.id,
      policyDecisionId: decision.id
    })

    return {
      workItem,
      approvalRequestId: approval.id,
      traceId: awaitingTrace.id,
      traceStatus: awaitingTrace.status,
      logFilePath: awaitingTrace.logFilePath,
      artifactId: storedArtifact.id,
      artifactPath,
      summary: {
        lane: workItem.ownerLane,
        workflowState: awaitingTrace.status,
        autonomyMode: args.autonomyMode ?? 'off',
        approvalState: approval.status,
        supportTier: args.supportTier || OPS_LOCAL_SUPPORT_TIER,
        generation: {
          providerId: generation.providerId,
          model: generation.model,
          configured: generation.configured
        },
        traceRef: awaitingTrace.id,
        nextAction: 'Review the draft artifact and approve the ops action before it can continue.'
      }
    }
  }

  const completedWorkItem = transitionWorkItem(workItem, 'completed')
  const completedTrace = updateRunTrace(traceWithLog, {
    status: 'completed',
    steps: mapOpsLoopSteps(loopResult),
    artifactIds: [storedArtifact.id],
    connectorCalls: buildOpsConnectorCalls({
      loopResult,
      supportTier: args.supportTier || OPS_LOCAL_SUPPORT_TIER
    }),
    observedFacts: [
      ...traceWithLog.observedFacts,
      {
        kind: 'harness-loop',
        scope: 'ops-run',
        loopStatus: loopResult.status,
        loopReason: loopResult.reason || null,
        providerId: providerResolution.providerId,
        providerModel: providerResolution.model,
        phaseProviders: Array.from(new Set(loopResult.steps.map((step) => step.providerId).filter(Boolean))),
        phaseProviderModels: loopResult.steps.map((step) => `${step.phase}:${step.providerModel || 'unknown'}`),
        reminderIds: Array.from(new Set(loopResult.steps.flatMap((step) => step.appliedReminderIds || []))),
        omittedPromptSections: Array.from(new Set(loopResult.steps.flatMap((step) => step.omittedPromptSections || []))),
        totalCostUsd: loopResult.totalCostUsd,
        approvalsRequested: loopResult.approvalsRequested || 0,
        errorCount: loopResult.errorCount || 0
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
      generation: {
        providerId: generation.providerId,
        model: generation.model,
        configured: generation.configured
      },
      traceRef: completedTrace.id,
      nextAction: 'Review the generated ops artifact and continue with operator validation.'
    }
  }
}
