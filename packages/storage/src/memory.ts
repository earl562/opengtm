import type { OpenGtmStorage, OpenGtmMemoryQuery } from './types.js'
import { listRecords } from './store.js'

export function queryMemoryRecords<T = Record<string, unknown>>(store: OpenGtmStorage, {
  workspaceId,
  memoryType,
  scope,
  sourceId
}: OpenGtmMemoryQuery = {}): T[] {
  let records = listRecords<T>(store, 'memory_records', { workspaceId })

  if (memoryType) {
    records = records.filter((record) => (record as Record<string, unknown>).memoryType === memoryType)
  }

  if (scope) {
    records = records.filter((record) => (record as Record<string, unknown>).scope === scope)
  }

  if (sourceId) {
    records = records.filter((record) => ((record as Record<string, unknown>).sourceIds as string[] | undefined)?.includes(sourceId))
  }

  return records
}