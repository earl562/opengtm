import type { OpenGtmMemoryType } from '@opengtm/types'
import { createMemoryRecord } from '@opengtm/core'
import {
  upsertRecord,
  deleteRecord,
  queryMemoryRecords,
  writeArtifactBlob,
  resolveArtifactPath
} from '@opengtm/storage'
import type { OpenGtmStorage } from '@opengtm/storage'
import { randomUUID } from 'node:crypto'

export interface StoredMemory {
  id: string
  workspaceId: string
  memoryType: OpenGtmMemoryType
  scope: string
  contentRef: string
  sourceIds: string[]
  retrievalHints: string[]
  archivalState: string
  createdAt: string
}

export interface MemoryWriteInput {
  workspaceId: string
  memoryType: OpenGtmMemoryType
  scope: string
  content: string
  sourceIds?: string[]
  retrievalHints?: string[]
}

export interface MemorySearchQuery {
  workspaceId: string
  memoryType?: OpenGtmMemoryType
  scope?: string
  text?: string
  limit?: number
}

export interface MemorySearchHit {
  record: StoredMemory
  content: string
  score: number
}

export interface MemorySummarizeInput {
  workspaceId: string
  scope: string
  memoryType?: OpenGtmMemoryType
  summarize: (contents: string[]) => Promise<string> | string
  keepLatest?: number
}

export interface MemorySummarizeResult {
  summaryId: string
  summarizedCount: number
  keptCount: number
  deletedCount: number
}

export interface MemoryManager {
  write(input: MemoryWriteInput): Promise<StoredMemory>
  search(query: MemorySearchQuery): Promise<MemorySearchHit[]>
  evict(recordId: string): Promise<boolean>
  summarize(input: MemorySummarizeInput): Promise<MemorySummarizeResult>
  read(recordId: string, workspaceId: string): Promise<string | null>
}

export interface MemoryManagerOptions {
  storage: OpenGtmStorage
  workspaceSlug?: string
  idGenerator?: () => string
  now?: () => Date
}

export function createMemoryManager(opts: MemoryManagerOptions): MemoryManager {
  const idGen = opts.idGenerator ?? (() => randomUUID())
  const now = opts.now ?? (() => new Date())
  const workspaceSlug = opts.workspaceSlug ?? 'global'

  const toStored = (record: Record<string, unknown>): StoredMemory => ({
    id: String(record.id),
    workspaceId: String(record.workspaceId),
    memoryType: record.memoryType as OpenGtmMemoryType,
    scope: String(record.scope),
    contentRef: String(record.contentRef),
    sourceIds: Array.isArray(record.sourceIds) ? (record.sourceIds as string[]) : [],
    retrievalHints: Array.isArray(record.retrievalHints)
      ? (record.retrievalHints as string[])
      : [],
    archivalState: String(record.archivalState ?? 'active'),
    createdAt: String(record.createdAt ?? now().toISOString())
  })

  return {
    async write(input) {
      const id = idGen()
      const artifactId = `memory-${id}`
      const contentRef = writeArtifactBlob(opts.storage, {
        workspaceSlug,
        artifactId,
        content: input.content,
        extension: 'txt'
      })

      const record = createMemoryRecord({
        id,
        workspaceId: input.workspaceId,
        memoryType: input.memoryType,
        scope: input.scope,
        contentRef,
        sourceIds: input.sourceIds ?? [],
        retrievalHints: input.retrievalHints ?? [],
        createdAt: now().toISOString()
      })

      upsertRecord(opts.storage, 'memory_records', record as unknown as {
        id: string
        workspaceId?: string | null
        createdAt?: string
      })

      return toStored(record as unknown as Record<string, unknown>)
    },

    async read(recordId, workspaceId) {
      const all = queryMemoryRecords<Record<string, unknown>>(opts.storage, {
        workspaceId
      })
      const hit = all.find((r) => r.id === recordId)
      if (!hit) return null
      return readContentRef(String(hit.contentRef))
    },

    async search(query) {
      const rawRecords = queryMemoryRecords<Record<string, unknown>>(opts.storage, {
        workspaceId: query.workspaceId,
        memoryType: query.memoryType,
        scope: query.scope
      })

      const hits: MemorySearchHit[] = []
      const needle = (query.text ?? '').trim().toLowerCase()

      for (const raw of rawRecords) {
        const stored = toStored(raw)
        const content = readContentRef(stored.contentRef)
        if (content === null) continue
        const score = needle ? rankRelevance(content, stored.retrievalHints, needle) : 1
        if (needle && score <= 0) continue
        hits.push({ record: stored, content, score })
      }

      hits.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return b.record.createdAt.localeCompare(a.record.createdAt)
      })

      const limit = query.limit ?? 10
      return hits.slice(0, Math.max(0, limit))
    },

    async evict(recordId) {
      const existing = queryMemoryRecords<Record<string, unknown>>(opts.storage)
      const hit = existing.find((r) => r.id === recordId)
      if (!hit) return false
      deleteRecord(opts.storage, 'memory_records', recordId)
      return true
    },

    async summarize(input) {
      const keepLatest = input.keepLatest ?? 0
      const records = queryMemoryRecords<Record<string, unknown>>(opts.storage, {
        workspaceId: input.workspaceId,
        scope: input.scope,
        memoryType: input.memoryType
      }).map(toStored)

      records.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const keptTail = keepLatest > 0 ? records.slice(-keepLatest) : []
      const toSummarize = keepLatest > 0 ? records.slice(0, -keepLatest) : records

      if (toSummarize.length === 0) {
        return {
          summaryId: '',
          summarizedCount: 0,
          keptCount: keptTail.length,
          deletedCount: 0
        }
      }

      const contents: string[] = []
      for (const rec of toSummarize) {
        const content = readContentRef(rec.contentRef)
        if (content !== null) contents.push(content)
      }

      const summaryText = await input.summarize(contents)

      const summaryId = idGen()
      const summaryArtifactId = `memory-summary-${summaryId}`
      const summaryContentRef = writeArtifactBlob(opts.storage, {
        workspaceSlug,
        artifactId: summaryArtifactId,
        content: summaryText,
        extension: 'txt'
      })

      const summaryRecord = createMemoryRecord({
        id: summaryId,
        workspaceId: input.workspaceId,
        memoryType: 'semantic',
        scope: input.scope,
        contentRef: summaryContentRef,
        sourceIds: toSummarize.map((r) => r.id),
        retrievalHints: ['summary', `of:${input.scope}`],
        promotionSource: `summarize:${input.scope}`,
        createdAt: now().toISOString()
      })

      upsertRecord(opts.storage, 'memory_records', summaryRecord as unknown as {
        id: string
        workspaceId?: string | null
        createdAt?: string
      })

      let deletedCount = 0
      for (const rec of toSummarize) {
        deleteRecord(opts.storage, 'memory_records', rec.id)
        deletedCount++
      }

      return {
        summaryId,
        summarizedCount: toSummarize.length,
        keptCount: keptTail.length,
        deletedCount
      }
    }
  }

  function readContentRef(contentRef: string): string | null {
    try {
      const fs = require('node:fs') as typeof import('node:fs')
      return fs.readFileSync(contentRef, 'utf8')
    } catch {
      return null
    }
  }
}

function rankRelevance(content: string, hints: string[], needle: string): number {
  const haystack = content.toLowerCase()
  let score = 0
  const terms = needle.split(/\s+/).filter(Boolean)
  for (const term of terms) {
    if (!term) continue
    const occurrences = countOccurrences(haystack, term)
    if (occurrences > 0) score += occurrences * 2
  }
  for (const hint of hints) {
    if (hint.toLowerCase().includes(needle)) score += 3
  }
  return score
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let idx = 0
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++
    idx += needle.length
  }
  return count
}

export function resolveMemoryArtifactPath(
  storage: OpenGtmStorage,
  memoryId: string,
  workspaceSlug = 'global'
): string {
  return resolveArtifactPath(storage, {
    workspaceSlug,
    artifactId: `memory-${memoryId}`,
    extension: 'txt'
  })
}
