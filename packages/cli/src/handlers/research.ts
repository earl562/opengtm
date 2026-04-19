import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { createArtifactRecord, createMemoryRecord, createRunTrace, updateRunTrace } from '@opengtm/core'
import { buildDefaultConnectorBundle, executeConnectorAction } from '@opengtm/connectors'
import { createJsonlRunLogger } from '@opengtm/observability'
import type { OpenGtmAutonomyMode } from '../autonomy.js'
import { classifyExecutionSupportTier } from '../truthfulness.js'

export async function handleResearchRun(args: {
  daemon: OpenGtmLocalDaemon
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
    const connectorResult = executeConnectorAction(bundle, {
      family: 'docs-knowledge',
      action: 'read-connector',
      target: args.goal,
      payload: {}
    })
    const connectorSupportTier = args.supportTier || classifyExecutionSupportTier({
      provider: connectorResult.provider,
      executionMode: connectorResult.executionMode
    })

    const artifact = createArtifactRecord({
      workspaceId,
      initiativeId: workItem.initiativeId,
      kind: 'analysis',
      lane: 'research',
      title: `Research output: ${args.goal}`,
      provenance: [
        'opengtm:research-run',
        `connector:${connectorResult.provider}`,
        `support-tier:${connectorSupportTier}`
      ]
    })

    const filePath = writeArtifactBlob(args.daemon.storage, {
      workspaceSlug: 'global',
      artifactId: artifact.id,
      content: connectorResult
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
      connectorCalls: [
        {
          provider: connectorResult.provider,
          family: connectorResult.family,
          action: connectorResult.action,
          requestedAction: connectorResult.requestedAction,
          executionMode: connectorResult.executionMode,
          supportTier: connectorSupportTier,
          target: args.goal
        }
      ],
      observedFacts: [
        {
          kind: 'truthfulness',
          scope: 'research-run',
          provider: connectorResult.provider,
          family: connectorResult.family,
          executionMode: connectorResult.executionMode,
          supportTier: connectorSupportTier,
          checkpointId: args.checkpointId || null
        }
      ],
      steps: [
        { name: 'ingest', status: 'completed' },
        { name: 'synthesize', status: 'completed' },
        { name: 'handoff', status: 'completed' }
      ],
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
          provider: connectorResult.provider,
          family: connectorResult.family,
          action: connectorResult.action,
          status: connectorResult.executionMode,
          supportTier: connectorSupportTier
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
