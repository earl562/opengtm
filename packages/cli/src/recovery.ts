import { createArtifactRecord } from '@opengtm/core'
import type { OpenGtmStorage } from '@opengtm/storage'
import { previewRollbackToCheckpoint, upsertRecord, writeArtifactBlob } from '@opengtm/storage'

export function writeRecoveryArtifact(args: {
  storage: OpenGtmStorage
  workspaceId: string
  initiativeId: string
  lane: 'ops-automate' | 'research' | 'build-integrate'
  title: string
  traceRef: string | null
  sourceIds?: string[]
  provenance?: string[]
  checkpoint?: { id: string; createdAt: string } | null
  payload: Record<string, unknown>
}) {
  const artifact = createArtifactRecord({
    workspaceId: args.workspaceId,
    initiativeId: args.initiativeId,
    kind: 'reconciliation-report',
    lane: args.lane,
    title: args.title,
    traceRef: args.traceRef,
    provenance: args.provenance || []
  })

  const rollbackPreview = args.checkpoint
    ? previewRollbackToCheckpoint(args.storage, args.checkpoint)
    : null

  const path = writeArtifactBlob(args.storage, {
    workspaceSlug: 'global',
    artifactId: artifact.id,
    content: {
      ...args.payload,
      rollbackPreview
    }
  })

  const storedArtifact = {
    ...artifact,
    contentRef: path,
    sourceIds: args.sourceIds || []
  }

  upsertRecord(args.storage, 'artifacts', storedArtifact as any)
  return {
    artifact: storedArtifact,
    artifactPath: path,
    rollbackPreview
  }
}
