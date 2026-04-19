import type { OpenGtmStorage } from './types.js'
import { listRecords, deleteRecord, deleteRecordsAfter } from './store.js'

export function compactWorkingMemory(store: OpenGtmStorage, {
  keepPerScope = 25
}: { keepPerScope?: number } = {}) {
  const all = listRecords<any>(store, 'memory_records')
  const byScope = new Map<string, any[]>()
  for (const rec of all) {
    const scope = String(rec.scope || 'global')
    const bucket = byScope.get(scope) || []
    bucket.push(rec)
    byScope.set(scope, bucket)
  }

  let deleted = 0
  for (const [, records] of byScope.entries()) {
    const sorted = [...records].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    const toDelete = sorted.slice(keepPerScope)
    for (const rec of toDelete) {
      deleteRecord(store, 'memory_records', rec.id)
      deleted++
    }
  }

  return { deleted, keptPerScope: keepPerScope }
}

export interface OpenGtmCheckpoint {
  id: string
  createdAt: string
}

const ROLLBACK_TABLES = [
  'work_items',
  'run_traces',
  'artifacts',
  'memory_records',
  'policy_decisions',
  'approval_requests',
  'feedback_records'
] as const

export function createCheckpoint(store: OpenGtmStorage, {
  id,
  createdAt = new Date().toISOString()
}: { id: string; createdAt?: string } ): OpenGtmCheckpoint {
  // Checkpoint is implicit: use createdAt cutline. Caller persists an artifact if desired.
  return { id, createdAt }
}

export function previewRollbackToCheckpoint(store: OpenGtmStorage, checkpoint: OpenGtmCheckpoint) {
  const candidateDeletionsByTable: Record<string, number> = {}
  for (const table of ROLLBACK_TABLES) {
    const records = listRecords<any>(store, table as any)
    candidateDeletionsByTable[table] = records.filter((record) =>
      String(record.createdAt || '') > checkpoint.createdAt
    ).length
  }

  return {
    checkpointId: checkpoint.id,
    candidateDeletionsByTable
  }
}

export function rollbackToCheckpoint(store: OpenGtmStorage, checkpoint: OpenGtmCheckpoint) {
  // Deterministic rollback: delete records created after checkpoint time in key mutable tables.
  const deletedByTable: Record<string, number> = {}
  for (const table of ROLLBACK_TABLES) {
    deletedByTable[table] = deleteRecordsAfter(store, table as any, checkpoint.createdAt)
  }
  return { checkpointId: checkpoint.id, deletedByTable }
}
