import { describe, expect, it, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStorage } from '@opengtm/storage'
import { createMemoryManager } from '../src/index.js'

describe('memory: manager', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'opengtm-mem-'))
  })

  it('writes and reads back content via contentRef', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const mm = createMemoryManager({
      storage,
      idGenerator: () => `id-${counter++}`
    })

    const rec = await mm.write({
      workspaceId: 'w1',
      memoryType: 'episodic',
      scope: 'run:1',
      content: 'the agent opened Salesforce and pulled account Acme'
    })

    expect(rec.id).toBe('id-0')
    expect(rec.memoryType).toBe('episodic')

    const content = await mm.read(rec.id, 'w1')
    expect(content).toBe('the agent opened Salesforce and pulled account Acme')
  })

  it('search without text returns all scoped records newest-first', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const times = ['2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-03T00:00:00.000Z']
    const mm = createMemoryManager({
      storage,
      idGenerator: () => `id-${counter}`,
      now: () => new Date(times[counter++] ?? times[times.length - 1])
    })

    await mm.write({ workspaceId: 'w', memoryType: 'episodic', scope: 's', content: 'one' })
    await mm.write({ workspaceId: 'w', memoryType: 'episodic', scope: 's', content: 'two' })
    await mm.write({ workspaceId: 'w', memoryType: 'episodic', scope: 's', content: 'three' })

    const hits = await mm.search({ workspaceId: 'w', scope: 's' })
    expect(hits.map((h) => h.content)).toEqual(['three', 'two', 'one'])
  })

  it('search with text ranks matches by occurrences and hints', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const mm = createMemoryManager({
      storage,
      idGenerator: () => `id-${counter++}`
    })

    await mm.write({
      workspaceId: 'w',
      memoryType: 'semantic',
      scope: 'kb',
      content: 'acme corp uses snowflake warehouse',
      retrievalHints: ['warehouse']
    })
    await mm.write({
      workspaceId: 'w',
      memoryType: 'semantic',
      scope: 'kb',
      content: 'acme acme acme keeps appearing everywhere'
    })
    await mm.write({
      workspaceId: 'w',
      memoryType: 'semantic',
      scope: 'kb',
      content: 'unrelated content about tacos'
    })

    const hits = await mm.search({ workspaceId: 'w', text: 'acme' })
    expect(hits.length).toBe(2)
    expect(hits[0].content).toContain('acme acme acme')
    expect(hits[0].score).toBeGreaterThan(hits[1].score)
  })

  it('evict removes record and returns true; false if missing', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const mm = createMemoryManager({
      storage,
      idGenerator: () => `id-${counter++}`
    })

    const rec = await mm.write({
      workspaceId: 'w',
      memoryType: 'episodic',
      scope: 's',
      content: 'to be evicted'
    })

    expect(await mm.evict(rec.id)).toBe(true)
    expect(await mm.evict(rec.id)).toBe(false)
    expect(await mm.read(rec.id, 'w')).toBe(null)
  })

  it('summarize replaces old records with semantic summary, keeps tail', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const times = [
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      '2026-01-03T00:00:00.000Z',
      '2026-01-04T00:00:00.000Z'
    ]
    const mm = createMemoryManager({
      storage,
      idGenerator: () => `id-${counter}`,
      now: () => new Date(times[counter++] ?? times[times.length - 1])
    })

    await mm.write({ workspaceId: 'w', memoryType: 'episodic', scope: 's', content: 'e1' })
    await mm.write({ workspaceId: 'w', memoryType: 'episodic', scope: 's', content: 'e2' })
    await mm.write({ workspaceId: 'w', memoryType: 'episodic', scope: 's', content: 'e3' })

    const result = await mm.summarize({
      workspaceId: 'w',
      scope: 's',
      keepLatest: 1,
      summarize: async (contents) => `SUMMARY OF ${contents.length}: ${contents.join('|')}`
    })

    expect(result.summarizedCount).toBe(2)
    expect(result.keptCount).toBe(1)
    expect(result.deletedCount).toBe(2)

    const remaining = await mm.search({ workspaceId: 'w', scope: 's' })
    const contents = remaining.map((r) => r.content).sort()
    expect(contents.some((c) => c.startsWith('SUMMARY OF 2'))).toBe(true)
    expect(contents.some((c) => c === 'e3')).toBe(true)
    expect(contents.includes('e1')).toBe(false)
    expect(contents.includes('e2')).toBe(false)
  })

  it('summarize returns noop shape when nothing to summarize', async () => {
    const storage = createStorage({ rootDir })
    const mm = createMemoryManager({ storage })
    const result = await mm.summarize({
      workspaceId: 'w',
      scope: 'empty',
      summarize: () => 'x'
    })
    expect(result).toEqual({
      summaryId: '',
      summarizedCount: 0,
      keptCount: 0,
      deletedCount: 0
    })
  })

  it('filters by memoryType in search', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const mm = createMemoryManager({
      storage,
      idGenerator: () => `id-${counter++}`
    })

    await mm.write({ workspaceId: 'w', memoryType: 'working', scope: 's', content: 'working-A' })
    await mm.write({ workspaceId: 'w', memoryType: 'episodic', scope: 's', content: 'episodic-B' })

    const hits = await mm.search({ workspaceId: 'w', memoryType: 'episodic' })
    expect(hits.map((h) => h.content)).toEqual(['episodic-B'])
  })
})
