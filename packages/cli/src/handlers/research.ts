import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { createArtifactRecord, createMemoryRecord, createRunTrace, updateRunTrace } from '@opengtm/core'
import { buildDefaultConnectorBundle } from '@opengtm/connectors'
import { runGovernedLoop, type OpenGtmLoopConnectorAction, type OpenGtmLoopResult } from '@opengtm/loop'
import { createContextBudget, createMemoryManager, createWorkingContext } from '@opengtm/memory'
import { createJsonlRunLogger } from '@opengtm/observability'
import { createMockProvider, type OpenGtmProvider } from '@opengtm/providers'
import { createSkillRegistryV2, loadGtmSkillArtifacts } from '@opengtm/skills'
import type { OpenGtmAutonomyMode } from '../autonomy.js'
import { collectCanonicalRuntimeEvidence, parseCanonicalConnectorTargets } from '../canonical-crm.js'
import { resolveWorkspaceProvider, resolveWorkspacePhaseProviders } from '../provider-runtime.js'
import { classifyExecutionSupportTier } from '../truthfulness.js'

interface OpenGtmResearchProviderResolution {
  providerId: string
  model: string
  authMode: 'none' | 'api-key' | 'oauth'
  configured: boolean
  provider: OpenGtmProvider
}

function createResearchLoopConnectorAction(args: {
  goal: string
  runtimeEvidence: Record<string, unknown> | null
}): OpenGtmLoopConnectorAction {
  return {
    family: 'docs',
    action: 'read-connector',
    target: args.goal,
    payload: args.runtimeEvidence || {}
  }
}

function mapResearchLoopSteps(loopResult: OpenGtmLoopResult) {
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

function summarizeResearchLoop(loopResult: OpenGtmLoopResult) {
  const reflectStep = [...loopResult.steps].reverse().find((step) => step.phase === 'reflect' && step.outputText?.trim())
  const lastTextStep = [...loopResult.steps].reverse().find((step) => step.outputText?.trim())
  return reflectStep?.outputText?.trim() || lastTextStep?.outputText?.trim() || 'No final research summary was generated.'
}

function buildResearchConnectorCalls(args: {
  loopResult: OpenGtmLoopResult
  supportTier: string
}) {
  return args.loopResult.steps
    .filter((step) => step.connectorAction && step.connectorResult)
    .map((step) => ({
      provider: step.connectorResult?.provider || null,
      family: step.connectorResult?.family || step.connectorAction?.family || null,
      action: step.connectorResult?.action || step.connectorAction?.action || null,
      requestedAction: step.connectorResult?.requestedAction || step.connectorAction?.action || null,
      executionMode: step.connectorResult?.executionMode || null,
      supportTier: args.supportTier,
      target: step.connectorResult?.target || step.connectorAction?.target || null,
      phase: step.phase
    }))
}

async function resolveResearchProvider(args: {
  cwd?: string
  goal: string
}): Promise<OpenGtmResearchProviderResolution> {
  if (!args.cwd) {
    return {
      providerId: 'mock',
      model: 'mock-0',
      authMode: 'none',
      configured: true,
      provider: createMockProvider({
        id: 'mock',
        seed: `opengtm:research:${args.goal}`
      })
    }
  }

  const resolved = await resolveWorkspaceProvider(args.cwd)
  return resolved as OpenGtmResearchProviderResolution
}

export async function handleResearchRun(args: {
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
  sourceIds?: string[]
  connectorTargets?: string[]
  supportTier?: string
  checkpointId?: string | null
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
    ownerLane: 'research',
    title: `Research: ${args.goal}`,
    goal: args.goal,
    sourceIds: args.sourceIds || [],
    connectorTargets: args.connectorTargets || []
  })

  if (args.autonomyMode === 'background') {
    const trace = createRunTrace({
      workItemId: workItem.id,
      workflowId: workItem.workflowId,
      lane: 'research',
      persona: args.persona || null,
      fixtureSetId: args.fixtureSetId || null,
      status: 'queued',
      steps: [
        { name: 'ingest', status: 'queued' },
        { name: 'synthesize', status: 'queued' },
        { name: 'handoff', status: 'queued' }
      ]
    })
    const { upsertRecord } = await import('@opengtm/storage')
    upsertRecord(args.daemon.storage, 'work_items', workItem)
    upsertRecord(args.daemon.storage, 'run_traces', trace)

    return {
      workItem,
      traceId: trace.id,
      traceStatus: trace.status,
      summary: {
        lane: workItem.ownerLane,
        workflowState: trace.status,
        autonomyMode: 'background',
        artifactsCreated: 0,
        memoryUpdated: 0,
        nextAction: 'Background autonomy queued the research job. Check traces or daemon status for progress.'
      }
    }
  }

  const startedAtMs = Date.now()
  const trace = createRunTrace({
    workItemId: workItem.id,
    workflowId: workItem.workflowId,
    lane: 'research',
    persona: args.persona || null,
    fixtureSetId: args.fixtureSetId || null,
    status: 'running',
    steps: [
      { name: 'ingest', status: 'running' },
      { name: 'synthesize', status: 'pending' },
      { name: 'handoff', status: 'pending' }
    ]
  })

  const logger = createJsonlRunLogger({
    rootDir: args.daemon.storage.rootDir,
    runId: trace.id,
    traceId: trace.id
  })

  const traceWithLog = updateRunTrace(trace, {
    logFilePath: logger.logFilePath,
    debugBundlePath: logger.logFilePath
  })

  const { writeArtifactBlob, upsertRecord } = await import('@opengtm/storage')

  // Persist early so failures still point to a trace + log.
  upsertRecord(args.daemon.storage, 'work_items', workItem)
  upsertRecord(args.daemon.storage, 'run_traces', traceWithLog)

  logger.log('run.start', {
    lane: 'research',
    goal: args.goal,
    workItemId: workItem.id,
    traceId: traceWithLog.id,
    logFilePath: logger.logFilePath
  })

  try {
    const bundle = buildDefaultConnectorBundle()
    const canonicalContext = parseCanonicalConnectorTargets(args.connectorTargets || [])
    const runtimeEvidence = canonicalContext.dbFile
      ? collectCanonicalRuntimeEvidence({
          dbFile: canonicalContext.dbFile,
          leadId: canonicalContext.leadId,
          accountId: canonicalContext.accountId,
          opportunityId: canonicalContext.opportunityId
        })
      : null
    const providerResolution = await resolveResearchProvider({
      cwd: args.cwd,
      goal: args.goal
    })
    const phaseProviderResolution = args.cwd
      ? await resolveWorkspacePhaseProviders(args.cwd)
      : null
    const workingContext = createWorkingContext()
    workingContext.set('goal', args.goal, { pinned: true })
    workingContext.set('lane', 'research', { pinned: true })
    workingContext.set('workflow_id', workItem.workflowId || 'lane-only', { pinned: true })
    workingContext.set('persona', args.persona || 'operator', { pinned: true })
    workingContext.set('provider', `${providerResolution.providerId}:${providerResolution.model}`, { pinned: true })
    workingContext.set('provider_configured', providerResolution.configured ? 'yes' : 'no', { pinned: true })
    if (phaseProviderResolution) {
      workingContext.set('phase_models', JSON.stringify(phaseProviderResolution.phaseModels), { pinned: true })
    }
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
    if (args.checkpointId || canonicalContext.checkpointId) {
      workingContext.set('checkpoint_id', args.checkpointId || canonicalContext.checkpointId || '', { pinned: true })
    }
    if (runtimeEvidence) {
      workingContext.set(
        'runtime_evidence',
        JSON.stringify({
          leadActivityCount: Array.isArray(runtimeEvidence.activities?.lead) ? runtimeEvidence.activities.lead.length : 0,
          accountActivityCount: Array.isArray(runtimeEvidence.activities?.account) ? runtimeEvidence.activities.account.length : 0,
          opportunityCount: runtimeEvidence.opportunity ? 1 : 0
        }),
        { pinned: true }
      )
    }

    const researchLoopAction = createResearchLoopConnectorAction({
      goal: args.goal,
      runtimeEvidence
    })
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
            tags: ['research']
          }
        },
        connectors: {
          bundle,
          parser: () => researchLoopAction
        },
        policy: {
          workItemId: workItem.id,
          workspaceId,
          lane: 'research'
        },
        observability: { logger },
        phaseProviders: phaseProviderResolution?.phaseProviders || {
          default: providerResolution.provider
        },
        prompt: {
          systemReminders: [
            'Keep the research output grounded in connector evidence and GTM-ready facts only.',
            'Do not propose outreach sends or other write-side effects from the research lane.'
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
      throw new Error(loopResult.failure?.message || 'Research harness loop failed before producing a completed trace.')
    }

    const connectorCall = loopResult.steps.find((step) => step.connectorResult)?.connectorResult
    if (!connectorCall) {
      throw new Error('Research harness did not produce a connector-backed evidence read.')
    }

    const connectorSupportTier = args.supportTier || classifyExecutionSupportTier({
      provider: connectorCall.provider,
      executionMode: connectorCall.executionMode
    })
    const generation = {
      providerId: providerResolution.providerId,
      model: providerResolution.model,
      configured: providerResolution.configured,
      authMode: providerResolution.authMode,
      text: summarizeResearchLoop(loopResult),
      tokens: {
        input: loopResult.steps.reduce((sum, step) => sum + (step.promptTokens || 0), 0),
        output: loopResult.steps.reduce((sum, step) => sum + (step.outputText?.length || 0), 0)
      }
    }

    const artifact = createArtifactRecord({
      workspaceId,
      initiativeId: workItem.initiativeId,
      kind: 'analysis',
      lane: 'research',
      title: `Research output: ${args.goal}`,
      provenance: [
        'opengtm:research-run',
        `connector:${connectorCall.provider}`,
        `support-tier:${connectorSupportTier}`
      ]
    })

    const filePath = writeArtifactBlob(args.daemon.storage, {
      workspaceSlug: 'global',
      artifactId: artifact.id,
      content: {
        runtimeEvidence,
        connectorResult: connectorCall,
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
        },
        generation
      }
    })

    const storedArtifact = {
      ...artifact,
      contentRef: filePath,
      traceRef: traceWithLog.id,
      sourceIds: args.sourceIds || []
    }

    const memoryRecord = createMemoryRecord({
      workspaceId,
      memoryType: 'working',
      scope: `initiative:${workItem.initiativeId}`,
      contentRef: filePath,
      sourceIds: args.sourceIds || [],
      retrievalHints: [args.goal]
    })

    upsertRecord(args.daemon.storage, 'artifacts', storedArtifact)
    upsertRecord(args.daemon.storage, 'memory_records', memoryRecord)

    logger.log('artifact.created', {
      artifactId: storedArtifact.id,
      artifactPath: filePath
    })

    const completedTrace = updateRunTrace(traceWithLog, {
      status: 'completed',
      connectorCalls: buildResearchConnectorCalls({
        loopResult,
        supportTier: connectorSupportTier
      }),
      observedFacts: [
        {
          kind: 'truthfulness',
          scope: 'research-run',
          provider: connectorCall.provider,
          family: connectorCall.family,
          executionMode: connectorCall.executionMode,
          supportTier: connectorSupportTier,
          accountId: canonicalContext.accountId,
          opportunityId: canonicalContext.opportunityId,
          checkpointId: args.checkpointId || null
        },
        {
          kind: 'harness-loop',
          scope: 'research-run',
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
      steps: mapResearchLoopSteps(loopResult),
      endedAt: new Date().toISOString()
    })
    upsertRecord(args.daemon.storage, 'run_traces', completedTrace)

    logger.finalize({
      status: 'completed',
      durationMs: Date.now() - startedAtMs,
      artifactId: storedArtifact.id
    })

    return {
      workItem,
      traceId: completedTrace.id,
      traceStatus: completedTrace.status,
      logFilePath: completedTrace.logFilePath,
      artifactId: storedArtifact.id,
      artifactPath: filePath,
      memoryId: memoryRecord.id,
      summary: {
        lane: workItem.ownerLane,
        workflowState: completedTrace.status,
        autonomyMode: args.autonomyMode ?? 'off',
        connector: {
          provider: connectorCall.provider,
          family: connectorCall.family,
          action: connectorCall.action,
          status: connectorCall.executionMode,
          supportTier: connectorSupportTier
        },
        generation: {
          providerId: generation.providerId,
          model: generation.model,
          configured: generation.configured
        },
        artifactsCreated: 1,
        memoryUpdated: 1,
        traceRef: completedTrace.id,
        nextAction: 'Review the analysis artifact and hand the trace to build if execution should continue.'
      }
    }
  } catch (err) {
    const e = err as Error & { stack?: string }
    logger.log('run.error', {
      message: typeof e?.message === 'string' ? e.message : String(err),
      stack: typeof e?.stack === 'string' ? e.stack : undefined
    }, 'error')

    const failedTrace = updateRunTrace(traceWithLog, {
      status: 'failed',
      endedAt: new Date().toISOString()
    })
    upsertRecord(args.daemon.storage, 'run_traces', failedTrace)

    logger.finalize({
      status: 'failed',
      durationMs: Date.now() - startedAtMs
    })

    throw err
  }
}
