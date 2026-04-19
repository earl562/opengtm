import { createArtifactRecord } from '@opengtm/core'
import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { createCheckpoint, upsertRecord, writeArtifactBlob } from '@opengtm/storage'
import { createCanonicalLead, resolveCanonicalCrmDbFile } from './canonical-crm.js'

export async function bootstrapLiveCrmLeadContext(args: {
  daemon: OpenGtmLocalDaemon
  workflowId: string
  workflowRunId: string
  workspaceId: string
  initiativeId?: string
  leadName: string
  sourceTag: string
}) {
  const crmDbFile = resolveCanonicalCrmDbFile(args.daemon.storage.rootDir)
  const leadEmail = `${args.leadName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'lead'}@example.com`
  const lead = createCanonicalLead(crmDbFile, {
    name: args.leadName,
    email: leadEmail
  })

  const checkpoint = createCheckpoint(args.daemon.storage, {
    id: `${args.workflowRunId}-bootstrap`
  })

  const checkpointArtifact = createArtifactRecord({
    workspaceId: args.workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    kind: 'decision-log',
    lane: 'ops-automate',
    title: `Live CRM checkpoint: ${lead.name}`,
    provenance: [
      args.sourceTag,
      `workflow:${args.workflowId}`,
      'support-tier:live'
    ]
  })

  const checkpointArtifactPath = writeArtifactBlob(args.daemon.storage, {
    workspaceSlug: 'global',
    artifactId: checkpointArtifact.id,
    content: {
      workflowId: args.workflowId,
      checkpoint,
      lead,
      crmDbFile,
      supportTier: 'live'
    }
  })

  upsertRecord(args.daemon.storage, 'artifacts', {
    ...checkpointArtifact,
    contentRef: checkpointArtifactPath,
    traceRef: null,
    sourceIds: []
  } as any)

  return {
    crmDbFile,
    lead,
    checkpoint,
    checkpointArtifactId: checkpointArtifact.id
  }
}
