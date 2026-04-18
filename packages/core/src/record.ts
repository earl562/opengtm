import { createEntityBase } from './utils.js'
import type { OpenGtmSystemRecord, OpenGtmSystemRecordInput, OpenGtmReconciliationReport, OpenGtmReconciliationReportInput } from '@opengtm/types'
import { OPEN_GTM_SYSTEMS_OF_RECORD, type OpenGtmSystemOfRecord, OPEN_GTM_FIELD_OWNERSHIP, type OpenGtmFieldOwnership } from '@opengtm/types'

export function createSystemRecord(input: OpenGtmSystemRecordInput): OpenGtmSystemRecord {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    initiativeId: input.initiativeId || null,
    accountId: input.accountId || null,
    system: input.system as OpenGtmSystemOfRecord,
    objectType: input.objectType,
    objectRef: input.objectRef,
    canonicalFields: input.canonicalFields || {},
    mirroredFields: input.mirroredFields || {},
    derivedFields: input.derivedFields || {}
  }
}

export function reconcileSystemRecord(
  existing: OpenGtmSystemRecord,
  incoming: Record<string, unknown>,
  fieldOwnership: OpenGtmFieldOwnership
): OpenGtmSystemRecord {
  const updates: Partial<OpenGtmSystemRecord> = {}

  if (fieldOwnership === 'canonical') {
    updates.canonicalFields = incoming
  } else if (fieldOwnership === 'mirrored') {
    updates.mirroredFields = incoming
  } else {
    updates.derivedFields = incoming
  }

  return { ...existing, ...updates }
}

export function createReconciliationReport(input: OpenGtmReconciliationReportInput): OpenGtmReconciliationReport {
  return {
    id: input.id || `reconcile-${Date.now()}`,
    workspaceId: input.workspaceId,
    system: input.system as OpenGtmSystemOfRecord,
    processed: input.processed || 0,
    created: input.created || 0,
    updated: input.updated || 0,
    errors: input.errors || [],
    createdAt: new Date().toISOString()
  }
}