import { createEntityBase } from './utils.js'
import type { OpenGtmAuditEvent, OpenGtmAuditEventInput } from '@opengtm/types'

export function createAuditEvent(input: OpenGtmAuditEventInput): OpenGtmAuditEvent {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    actor: input.actor,
    changes: input.changes || {}
  }
}