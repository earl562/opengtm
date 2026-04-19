import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStorage, upsertRecord, listRecords } from '../src/index.js'
import { compactWorkingMemory, createCheckpoint, previewRollbackToCheckpoint, rollbackToCheckpoint } from '../src/lifecycle.js'
import { createMemoryRecord } from '@opengtm/core'

describe('storage lifecycle', () => {
  it('compacts working memory per scope', () => {
    const root = mkdtempSync(join(tmpdir(), 'opengtm-store-'))
    const store = createStorage({ rootDir: root })
    for (let i = 0; i < 10; i++) {
      const rec = createMemoryRecord({
        workspaceId: 'w',
        memoryType: 'working',
        scope: 's1',
        contentRef: `c${i}`
      })
      upsertRecord(store as any, 'memory_records', rec as any)
    }
    const before = listRecords(store as any, 'memory_records').length
    expect(before).toBe(10)
    const result = compactWorkingMemory(store as any, { keepPerScope: 3 })
    expect(result.deleted).toBe(7)
    const after = listRecords(store as any, 'memory_records').length
    expect(after).toBe(3)
  })

  it('rolls back records created after checkpoint', () => {
    const root = mkdtempSync(join(tmpdir(), 'opengtm-store-'))
    const store = createStorage({ rootDir: root })
    const cp = createCheckpoint(store as any, { id: 'cp1', createdAt: new Date(Date.now() - 10_000).toISOString() })
    const rec = createMemoryRecord({
      workspaceId: 'w',
      memoryType: 'working',
      scope: 's1',
      contentRef: 'new'
    })
    upsertRecord(store as any, 'memory_records', rec as any)
    expect(listRecords(store as any, 'memory_records').length).toBe(1)
    rollbackToCheckpoint(store as any, cp)
    expect(listRecords(store as any, 'memory_records').length).toBe(0)
  })

  it('previews rollback candidates without deleting records', () => {
    const root = mkdtempSync(join(tmpdir(), 'opengtm-store-'))
    const store = createStorage({ rootDir: root })
    const cp = createCheckpoint(store as any, { id: 'cp-preview', createdAt: new Date(Date.now() - 10_000).toISOString() })
    const rec = createMemoryRecord({
      workspaceId: 'w',
      memoryType: 'working',
      scope: 's1',
      contentRef: 'new'
    })
    upsertRecord(store as any, 'memory_records', rec as any)

    const preview = previewRollbackToCheckpoint(store as any, cp)
    expect(preview.candidateDeletionsByTable.memory_records).toBe(1)
    expect(listRecords(store as any, 'memory_records').length).toBe(1)
  })
})
