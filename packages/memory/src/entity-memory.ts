import type {
  MemoryManager,
  MemorySearchHit,
  MemorySearchQuery,
  MemorySummarizeInput,
  MemorySummarizeResult,
  MemoryWriteInput,
  StoredMemory
} from './manager.js'

export const GTM_MEMORY_ENTITY_KINDS = ['rep', 'account', 'stakeholder', 'opportunity'] as const

export type GtmMemoryEntityKind = (typeof GTM_MEMORY_ENTITY_KINDS)[number]

export interface GtmMemoryEntityRef {
  kind: GtmMemoryEntityKind
  id: string
}

export interface GtmMemoryRelation extends GtmMemoryEntityRef {
  relation?: string
}

export interface GtmEntityMemoryWriteInput extends Omit<MemoryWriteInput, 'scope'> {
  entity: GtmMemoryEntityRef
  relations?: GtmMemoryRelation[]
}

export interface GtmEntityMemorySearchQuery extends Omit<MemorySearchQuery, 'scope'> {
  entity: GtmMemoryEntityRef
}

export interface GtmEntityMemorySummarizeInput extends Omit<MemorySummarizeInput, 'scope'> {
  entity: GtmMemoryEntityRef
}

export interface GtmEntityDossierQuery extends Omit<MemorySearchQuery, 'scope'> {
  entity: GtmMemoryEntityRef
  relations?: GtmMemoryRelation[]
  perEntityLimit?: number
  includeEmptySections?: boolean
}

export interface GtmEntityDossierSection {
  entity: GtmMemoryEntityRef
  relation?: string
  scope: string
  hits: MemorySearchHit[]
}

export interface GtmEntityDossier {
  root: GtmEntityMemoryRefWithScope
  sections: GtmEntityDossierSection[]
  totalHits: number
}

export interface ParsedGtmMemoryScope extends GtmMemoryEntityRef {
  scope: string
}

interface GtmEntityMemoryRefWithScope extends GtmMemoryEntityRef {
  scope: string
}

export interface GtmEntityMemoryManager extends MemoryManager {
  writeEntityMemory(input: GtmEntityMemoryWriteInput): Promise<StoredMemory>
  searchEntityMemory(query: GtmEntityMemorySearchQuery): Promise<MemorySearchHit[]>
  summarizeEntityMemory(input: GtmEntityMemorySummarizeInput): Promise<MemorySummarizeResult>
  getEntityDossier(query: GtmEntityDossierQuery): Promise<GtmEntityDossier>
}

export function createGtmEntityMemoryManager(manager: MemoryManager): GtmEntityMemoryManager {
  return {
    ...manager,
    writeEntityMemory(input) {
      return writeEntityMemory(manager, input)
    },
    searchEntityMemory(query) {
      return searchEntityMemory(manager, query)
    },
    summarizeEntityMemory(input) {
      return summarizeEntityMemory(manager, input)
    },
    getEntityDossier(query) {
      return getEntityDossier(manager, query)
    }
  }
}

export async function writeEntityMemory(
  manager: Pick<MemoryManager, 'write'>,
  input: GtmEntityMemoryWriteInput
): Promise<StoredMemory> {
  const scope = buildGtmEntityMemoryScope(input.entity)
  const retrievalHints = mergeUniqueHints(
    input.retrievalHints,
    getEntityRetrievalHints(input.entity, input.relations)
  )

  return manager.write({
    ...input,
    scope,
    retrievalHints
  })
}

export function searchEntityMemory(
  manager: Pick<MemoryManager, 'search'>,
  query: GtmEntityMemorySearchQuery
): Promise<MemorySearchHit[]> {
  return manager.search({
    ...query,
    scope: buildGtmEntityMemoryScope(query.entity)
  })
}

export function summarizeEntityMemory(
  manager: Pick<MemoryManager, 'summarize'>,
  input: GtmEntityMemorySummarizeInput
): Promise<MemorySummarizeResult> {
  return manager.summarize({
    ...input,
    scope: buildGtmEntityMemoryScope(input.entity)
  })
}

export async function getEntityDossier(
  manager: Pick<MemoryManager, 'search'>,
  query: GtmEntityDossierQuery
): Promise<GtmEntityDossier> {
  const root = toScopedEntity(query.entity)
  const relationEntities = (query.relations ?? []).map((relation) => ({
    ...toScopedEntity(relation),
    relation: relation.relation
  }))

  const uniqueSections = dedupeSections([
    { ...root },
    ...relationEntities
  ])

  const sections: GtmEntityDossierSection[] = []
  for (const sectionEntity of uniqueSections) {
    const hits = await manager.search({
      workspaceId: query.workspaceId,
      memoryType: query.memoryType,
      text: query.text,
      limit: query.perEntityLimit ?? query.limit,
      scope: sectionEntity.scope
    })

    if (hits.length > 0 || query.includeEmptySections) {
      sections.push({
        entity: {
          kind: sectionEntity.kind,
          id: sectionEntity.id
        },
        relation: sectionEntity.relation,
        scope: sectionEntity.scope,
        hits
      })
    }
  }

  return {
    root,
    sections,
    totalHits: sections.reduce((acc, section) => acc + section.hits.length, 0)
  }
}

export function buildGtmEntityMemoryScope(entity: GtmMemoryEntityRef): string {
  validateEntity(entity)
  return `${entity.kind}:${entity.id}`
}

export function parseGtmEntityMemoryScope(scope: string): ParsedGtmMemoryScope | null {
  const [kind, ...rest] = scope.split(':')
  const id = rest.join(':')

  if (!isGtmMemoryEntityKind(kind) || !id) {
    return null
  }

  return {
    kind,
    id,
    scope
  }
}

export function isGtmMemoryEntityKind(value: string): value is GtmMemoryEntityKind {
  return GTM_MEMORY_ENTITY_KINDS.includes(value as GtmMemoryEntityKind)
}

function getEntityRetrievalHints(
  entity: GtmMemoryEntityRef,
  relations: GtmMemoryRelation[] | undefined
): string[] {
  const hints = [`entity:${entity.kind}`, `entity-id:${entity.id}`, `scope:${buildGtmEntityMemoryScope(entity)}`]

  for (const relation of relations ?? []) {
    validateEntity(relation)
    const relationScope = buildGtmEntityMemoryScope(relation)
    hints.push(`relation:${relation.kind}:${relation.id}`)
    hints.push(`relation-scope:${relationScope}`)
    if (relation.relation) {
      hints.push(`relation-label:${relation.relation}`)
      hints.push(`relation:${relation.relation}:${relation.kind}:${relation.id}`)
    }
  }

  return hints
}

function toScopedEntity(entity: GtmMemoryEntityRef): GtmEntityMemoryRefWithScope {
  return {
    kind: entity.kind,
    id: entity.id,
    scope: buildGtmEntityMemoryScope(entity)
  }
}

function dedupeSections(
  sections: Array<GtmEntityMemoryRefWithScope & { relation?: string }>
): Array<GtmEntityMemoryRefWithScope & { relation?: string }> {
  const byScope = new Map<string, GtmEntityMemoryRefWithScope & { relation?: string }>()
  for (const section of sections) {
    if (!byScope.has(section.scope)) {
      byScope.set(section.scope, section)
    }
  }
  return Array.from(byScope.values())
}

function mergeUniqueHints(existing: string[] | undefined, extra: string[]): string[] {
  return Array.from(new Set([...(existing ?? []), ...extra]))
}

function validateEntity(entity: GtmMemoryEntityRef): void {
  if (!isGtmMemoryEntityKind(entity.kind)) {
    throw new Error(`Unsupported GTM memory entity kind: ${entity.kind}`)
  }

  if (!entity.id.trim()) {
    throw new Error(`GTM memory entity id is required for ${entity.kind}`)
  }
}
