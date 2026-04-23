export interface OpenGtmLeadSessionLineage {
  kind: 'lead'
  entityName: string
  crmDbFile: string
  lead: {
    id: string
    name: string
    email: string | null
    status: 'new' | 'qualified' | 'disqualified'
    createdAt: string
  }
  account?: {
    id: string
    name: string
    domain: string | null
    stage: 'customer' | 'prospect'
    createdAt: string
  } | null
  checkpoint: {
    id: string
    createdAt: string
  }
  checkpointArtifactId: string
  sourceArtifactIds: string[]
  lastArtifactId: string | null
  lastMemoryId: string | null
}

export interface OpenGtmAccountSessionLineage {
  kind: 'account'
  entityName: string
  crmDbFile: string
  account: {
    id: string
    name: string
    domain: string | null
    stage: 'customer' | 'prospect'
    createdAt: string
  }
  checkpoint: {
    id: string
    createdAt: string
  }
  checkpointArtifactId: string
  sourceArtifactIds: string[]
  dossierArtifactId: string | null
  dossierMemoryId: string | null
}

export interface OpenGtmDealSessionLineage {
  kind: 'deal'
  entityName: string
  crmDbFile: string
  account: OpenGtmAccountSessionLineage['account']
  opportunity: {
    id: string
    name: string
    amountCents: number | null
    accountId: string
    stage: 'open' | 'won' | 'lost'
    createdAt: string
  }
  checkpoint: {
    id: string
    createdAt: string
  }
  checkpointArtifactId: string
  sourceArtifactIds: string[]
  dossierArtifactId: string | null
  dossierMemoryId: string | null
}

export interface OpenGtmSessionLineageState {
  lead: OpenGtmLeadSessionLineage | null
  account: OpenGtmAccountSessionLineage | null
  deal: OpenGtmDealSessionLineage | null
}

export function createEmptySessionLineageState(): OpenGtmSessionLineageState {
  return {
    lead: null,
    account: null,
    deal: null
  }
}

export function mergeSessionLineageState(
  current: OpenGtmSessionLineageState | null | undefined,
  update: Partial<OpenGtmSessionLineageState> | null | undefined
): OpenGtmSessionLineageState {
  const base = normalizeSessionLineageState(current)
  if (!update) return base
  return {
    lead: update.lead === undefined ? base.lead : update.lead,
    account: update.account === undefined ? base.account : update.account,
    deal: update.deal === undefined ? base.deal : update.deal
  }
}

export function normalizeSessionLineageState(
  state: OpenGtmSessionLineageState | null | undefined
): OpenGtmSessionLineageState {
  if (!state) return createEmptySessionLineageState()
  return {
    lead: state.lead || null,
    account: state.account || null,
    deal: state.deal || null
  }
}

export function uniqueArtifactIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

export function normalizeEntityKey(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function entityMatches(expected: string | null | undefined, actual: string | null | undefined) {
  const left = normalizeEntityKey(expected)
  const right = normalizeEntityKey(actual)
  return Boolean(left) && Boolean(right) && (left === right || left.includes(right) || right.includes(left))
}
