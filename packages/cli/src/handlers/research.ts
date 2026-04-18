import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { createRunTrace, updateRunTrace, createArtifactRecord, createMemoryRecord } from '@opengtm/core'
import { buildDefaultConnectorBundle, executeConnectorAction } from '@opengtm/connectors'

export async function handleResearchRun(args: {
  daemon: OpenGtmLocalDaemon
  goal: string
  workspaceId?: string
  initiativeId?: string
}) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const workItem = args.daemon.createWorkItem({
    workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    ownerLane: 'research',
    title: `Research: ${args.goal}`,
    goal: args.goal
  })

  const trace = createRunTrace({
    workItemId: workItem.id,
    lane: 'research',
    status: 'running',
    steps: [
      { name: 'ingest', status: 'running' },
      { name: 'synthesize', status: 'pending' },
      { name: 'handoff', status: 'pending' }
    ]
  })

  const bundle = buildDefaultConnectorBundle()
  const connectorResult = executeConnectorAction(bundle, {
    family: 'docs-knowledge',
    action: 'read-connector',
    target: args.goal,
    payload: {}
  })

  const artifact = createArtifactRecord({
    workspaceId,
    initiativeId: workItem.initiativeId,
    kind: 'analysis',
    lane: 'research',
    title: `Research output: ${args.goal}`,
    provenance: [
      'opengtm:research-run',
      `connector:${connectorResult.provider}`
    ]
  })

  const { writeArtifactBlob, upsertRecord } = await import('@opengtm/storage')
  const filePath = writeArtifactBlob(args.daemon.storage as any, {
    workspaceSlug: 'global',
    artifactId: artifact.id,
    content: connectorResult
  })

  const storedArtifact = {
    ...artifact,
    contentRef: filePath,
    traceRef: trace.id,
    sourceIds: []
  }

  const memoryRecord = createMemoryRecord({
    workspaceId,
    memoryType: 'working',
    scope: `initiative:${workItem.initiativeId}`,
    contentRef: filePath,
    sourceIds: [],
    retrievalHints: [args.goal]
  })

  upsertRecord(args.daemon.storage as any, 'work_items', workItem as any)
  upsertRecord(args.daemon.storage as any, 'run_traces', trace as any)
  upsertRecord(args.daemon.storage as any, 'artifacts', storedArtifact as any)
  upsertRecord(args.daemon.storage as any, 'memory_records', memoryRecord as any)

  const completedTrace = updateRunTrace(trace, {
    status: 'completed',
    steps: [
      { name: 'ingest', status: 'completed' },
      { name: 'synthesize', status: 'completed' },
      { name: 'handoff', status: 'completed' }
    ],
    endedAt: new Date().toISOString()
  })
  upsertRecord(args.daemon.storage as any, 'run_traces', completedTrace as any)

  return {
    workItem,
    traceId: completedTrace.id,
    artifactId: storedArtifact.id,
    artifactPath: filePath
  }
}
