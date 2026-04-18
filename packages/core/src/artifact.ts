import { createEntityBase } from './utils.js'
import type { OpenGtmArtifactRecord, OpenGtmArtifactInput } from '@opengtm/types'
import { OPEN_GTM_LANES, type OpenGtmLane, OPEN_GTM_ARTIFACT_KINDS, type OpenGtmArtifactKind } from '@opengtm/types'

export function createArtifactRecord(input: OpenGtmArtifactInput): OpenGtmArtifactRecord {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    initiativeId: input.initiativeId,
    kind: input.kind as OpenGtmArtifactKind,
    lane: input.lane as OpenGtmLane,
    title: input.title,
    contentRef: input.contentRef || null,
    sourceIds: input.sourceIds || [],
    traceRef: input.traceRef || null,
    provenance: input.provenance || []
  }
}