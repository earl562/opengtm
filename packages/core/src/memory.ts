import { createEntityBase } from './utils.js'
import type { OpenGtmMemoryRecord, OpenGtmMemoryRecordInput } from '@opengtm/types'
import { OPEN_GTM_MEMORY_TYPES, type OpenGtmMemoryType, OPEN_GTM_ARCHIVAL_STATES, type OpenGtmArchivalState, OPEN_GTM_REDACTION_STATES, type OpenGtmRedactionState } from '@opengtm/types'

export function createMemoryRecord(input: OpenGtmMemoryRecordInput): OpenGtmMemoryRecord {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    memoryType: input.memoryType as OpenGtmMemoryType,
    scope: input.scope,
    contentRef: input.contentRef,
    sourceIds: input.sourceIds || [],
    retentionPolicy: input.retentionPolicy || 'standard',
    ttlDays: input.ttlDays ?? null,
    archivalState: (input.archivalState as OpenGtmArchivalState) || 'active',
    redactionState: (input.redactionState as OpenGtmRedactionState) || 'visible',
    promotionSource: input.promotionSource || null,
    retrievalHints: input.retrievalHints || []
  }
}