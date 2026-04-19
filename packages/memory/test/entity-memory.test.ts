import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStorage } from '@opengtm/storage'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildGtmEntityMemoryScope,
  createGtmEntityMemoryManager,
  createMemoryManager,
  getEntityDossier,
  parseGtmEntityMemoryScope,
  searchEntityMemory,
  summarizeEntityMemory,
  type GtmMemoryEntityKind,
  writeEntityMemory,
} from '../src/index.js'

describe('memory: GTM entity memory', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'opengtm-entity-mem-'))
  })

  it('builds and parses canonical GTM entity scopes', () => {
    expect(buildGtmEntityMemoryScope({ kind: 'rep', id: 'rep-1' })).toBe('rep:rep-1')
    expect(parseGtmEntityMemoryScope('stakeholder:contact-9')).toEqual({
      kind: 'stakeholder',
      id: 'contact-9',
      scope: 'stakeholder:contact-9'
    })
    expect(parseGtmEntityMemoryScope('journey:j-1')).toBeNull()
  })

  it('writes route to the correct entity scope with GTM hints and relations', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const manager = createMemoryManager({
      storage,
      idGenerator: () => `id-${counter++}`
    })

    const record = await writeEntityMemory(manager, {
      workspaceId: 'w1',
      memoryType: 'episodic',
      entity: { kind: 'opportunity', id: 'opp-7' },
      relations: [
        { kind: 'account', id: 'acct-2', relation: 'account' },
        { kind: 'stakeholder', id: 'contact-8', relation: 'buyer' }
      ],
      retrievalHints: ['late-stage'],
      content: 'Opportunity opp-7 is blocked on legal review.'
    })

    expect(record.scope).toBe('opportunity:opp-7')

    const [hit] = await manager.search({ workspaceId: 'w1', scope: 'opportunity:opp-7' })
    expect(hit.record.retrievalHints).toEqual(
      expect.arrayContaining([
        'late-stage',
        'entity:opportunity',
        'entity-id:opp-7',
        'scope:opportunity:opp-7',
        'relation:account:acct-2',
        'relation:buyer:stakeholder:contact-8'
      ])
    )
  })

  it('searches stay isolated by entity scope', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const manager = createMemoryManager({
      storage,
      idGenerator: () => `id-${counter++}`
    })

    await writeEntityMemory(manager, {
      workspaceId: 'w1',
      memoryType: 'semantic',
      entity: { kind: 'account', id: 'acct-1' },
      content: 'Acme runs Salesforce and Gong.'
    })
    await writeEntityMemory(manager, {
      workspaceId: 'w1',
      memoryType: 'semantic',
      entity: { kind: 'account', id: 'acct-2' },
      content: 'Beta runs HubSpot only.'
    })

    const hits = await searchEntityMemory(manager, {
      workspaceId: 'w1',
      entity: { kind: 'account', id: 'acct-1' },
      text: 'Salesforce'
    })

    expect(hits).toHaveLength(1)
    expect(hits[0]?.content).toContain('Acme runs Salesforce')
  })

  it('summaries collapse only within the targeted entity scope', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const times = [
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      '2026-01-03T00:00:00.000Z',
      '2026-01-04T00:00:00.000Z'
    ]
    const manager = createMemoryManager({
      storage,
      idGenerator: () => `id-${counter}`,
      now: () => new Date(times[counter++] ?? times[times.length - 1])
    })

    await writeEntityMemory(manager, {
      workspaceId: 'w1',
      memoryType: 'episodic',
      entity: { kind: 'stakeholder', id: 'contact-1' },
      content: 'Call one'
    })
    await writeEntityMemory(manager, {
      workspaceId: 'w1',
      memoryType: 'episodic',
      entity: { kind: 'stakeholder', id: 'contact-1' },
      content: 'Call two'
    })
    await writeEntityMemory(manager, {
      workspaceId: 'w1',
      memoryType: 'episodic',
      entity: { kind: 'stakeholder', id: 'contact-2' },
      content: 'Other stakeholder call'
    })

    const result = await summarizeEntityMemory(manager, {
      workspaceId: 'w1',
      entity: { kind: 'stakeholder', id: 'contact-1' },
      summarize: (contents) => `SUMMARY:${contents.join('|')}`
    })

    expect(result.summarizedCount).toBe(2)

    const targetHits = await searchEntityMemory(manager, {
      workspaceId: 'w1',
      entity: { kind: 'stakeholder', id: 'contact-1' }
    })
    expect(targetHits).toHaveLength(1)
    expect(targetHits[0]?.content).toBe('SUMMARY:Call one|Call two')

    const otherHits = await searchEntityMemory(manager, {
      workspaceId: 'w1',
      entity: { kind: 'stakeholder', id: 'contact-2' }
    })
    expect(otherHits).toHaveLength(1)
    expect(otherHits[0]?.content).toBe('Other stakeholder call')
  })

  it('supports rep, account, stakeholder, and opportunity scopes through the wrapper manager', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const entityManager = createGtmEntityMemoryManager(
      createMemoryManager({
        storage,
        idGenerator: () => `id-${counter++}`
      })
    )

    const cases: Array<{ kind: GtmMemoryEntityKind; id: string; content: string }> = [
      { kind: 'rep', id: 'rep-1', content: 'Rep prefers concise outbound messaging.' },
      { kind: 'account', id: 'acct-1', content: 'Account is expanding into EMEA.' },
      { kind: 'stakeholder', id: 'contact-1', content: 'Stakeholder owns security review.' },
      { kind: 'opportunity', id: 'opp-1', content: 'Opportunity target close is Q3.' }
    ]

    for (const entry of cases) {
      await entityManager.writeEntityMemory({
        workspaceId: 'w1',
        memoryType: 'semantic',
        entity: { kind: entry.kind, id: entry.id },
        content: entry.content
      })
    }

    for (const entry of cases) {
      const hits = await entityManager.searchEntityMemory({
        workspaceId: 'w1',
        entity: { kind: entry.kind, id: entry.id }
      })

      expect(hits).toHaveLength(1)
      expect(hits[0]?.content).toBe(entry.content)
      expect(hits[0]?.record.scope).toBe(`${entry.kind}:${entry.id}`)
    }
  })

  it('smoke: entity-scoped retrieval returns only the requested GTM entity memory', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const entityManager = createGtmEntityMemoryManager(
      createMemoryManager({
        storage,
        idGenerator: () => `id-${counter++}`
      })
    )

    await entityManager.writeEntityMemory({
      workspaceId: 'w1',
      memoryType: 'semantic',
      entity: { kind: 'rep', id: 'rep-22' },
      content: 'Rep 22 is assigned to the Acme expansion motion.'
    })
    await entityManager.writeEntityMemory({
      workspaceId: 'w1',
      memoryType: 'semantic',
      entity: { kind: 'account', id: 'acct-acme' },
      content: 'Acme is evaluating multi-year pricing.'
    })

    const hits = await entityManager.searchEntityMemory({
      workspaceId: 'w1',
      entity: { kind: 'rep', id: 'rep-22' },
      text: 'Acme'
    })

    expect(hits).toHaveLength(1)
    expect(hits[0]?.record.scope).toBe('rep:rep-22')
    expect(hits[0]?.content).toBe('Rep 22 is assigned to the Acme expansion motion.')
  })

  it('assembles a dossier across root entity and related GTM entities', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const manager = createMemoryManager({
      storage,
      idGenerator: () => `id-${counter++}`
    })

    await writeEntityMemory(manager, {
      workspaceId: 'w1',
      memoryType: 'semantic',
      entity: { kind: 'opportunity', id: 'opp-7' },
      content: 'Opportunity opp-7 is blocked on legal review.'
    })
    await writeEntityMemory(manager, {
      workspaceId: 'w1',
      memoryType: 'semantic',
      entity: { kind: 'account', id: 'acct-2' },
      content: 'Account acct-2 is pushing for annual prepay.'
    })
    await writeEntityMemory(manager, {
      workspaceId: 'w1',
      memoryType: 'semantic',
      entity: { kind: 'stakeholder', id: 'contact-8' },
      content: 'Stakeholder contact-8 owns procurement review.'
    })

    const dossier = await getEntityDossier(manager, {
      workspaceId: 'w1',
      entity: { kind: 'opportunity', id: 'opp-7' },
      relations: [
        { kind: 'account', id: 'acct-2', relation: 'account' },
        { kind: 'stakeholder', id: 'contact-8', relation: 'buyer' }
      ]
    })

    expect(dossier.root).toEqual({
      kind: 'opportunity',
      id: 'opp-7',
      scope: 'opportunity:opp-7'
    })
    expect(dossier.totalHits).toBe(3)
    expect(dossier.sections.map((section) => section.scope)).toEqual([
      'opportunity:opp-7',
      'account:acct-2',
      'stakeholder:contact-8'
    ])
    expect(dossier.sections[1]?.relation).toBe('account')
    expect(dossier.sections[2]?.relation).toBe('buyer')
    expect(dossier.sections[0]?.hits[0]?.content).toContain('legal review')
    expect(dossier.sections[1]?.hits[0]?.content).toContain('annual prepay')
    expect(dossier.sections[2]?.hits[0]?.content).toContain('procurement review')
  })

  it('can include empty dossier sections for related entities without stored memory', async () => {
    const storage = createStorage({ rootDir })
    const manager = createMemoryManager({ storage })

    await writeEntityMemory(manager, {
      workspaceId: 'w1',
      memoryType: 'semantic',
      entity: { kind: 'account', id: 'acct-1' },
      content: 'Acme is in renewal planning.'
    })

    const dossier = await getEntityDossier(manager, {
      workspaceId: 'w1',
      entity: { kind: 'account', id: 'acct-1' },
      relations: [
        { kind: 'rep', id: 'rep-1', relation: 'owner' }
      ],
      includeEmptySections: true
    })

    expect(dossier.sections).toHaveLength(2)
    expect(dossier.sections[0]?.scope).toBe('account:acct-1')
    expect(dossier.sections[1]).toMatchObject({
      scope: 'rep:rep-1',
      relation: 'owner',
      hits: []
    })
  })

  it('exposes dossier retrieval through the wrapper manager', async () => {
    const storage = createStorage({ rootDir })
    let counter = 0
    const entityManager = createGtmEntityMemoryManager(
      createMemoryManager({
        storage,
        idGenerator: () => `id-${counter++}`
      })
    )

    await entityManager.writeEntityMemory({
      workspaceId: 'w1',
      memoryType: 'semantic',
      entity: { kind: 'rep', id: 'rep-7' },
      content: 'Rep 7 prefers concise executive summaries.'
    })
    await entityManager.writeEntityMemory({
      workspaceId: 'w1',
      memoryType: 'semantic',
      entity: { kind: 'account', id: 'acct-7' },
      content: 'Account 7 has an expansion motion in EMEA.'
    })

    const dossier = await entityManager.getEntityDossier({
      workspaceId: 'w1',
      entity: { kind: 'rep', id: 'rep-7' },
      relations: [{ kind: 'account', id: 'acct-7', relation: 'owns' }]
    })

    expect(dossier.totalHits).toBe(2)
    expect(dossier.sections.map((section) => section.scope)).toEqual([
      'rep:rep-7',
      'account:acct-7'
    ])
  })
})
