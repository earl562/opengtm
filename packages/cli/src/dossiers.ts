import { createAccount, createArtifactRecord, createMemoryRecord, createOpportunity } from '@opengtm/core'
import type { OpenGtmStorage } from '@opengtm/storage'
import { upsertRecord, writeArtifactBlob } from '@opengtm/storage'

export interface OpenGtmAccountDossierPayload {
  account: {
    id: string
    crmAccountId: string
    name: string
    domain: string | null
    stage: string
  }
  motion: string
  supportTier: 'live'
  checkpoint: {
    id: string
    createdAt: string
  }
  health: {
    score: number
    trend: 'up' | 'flat' | 'down'
    components: Record<string, number>
  }
  risks: string[]
  opportunities: string[]
  sourceArtifactIds: string[]
}

export interface OpenGtmDealDossierPayload {
  account: OpenGtmAccountDossierPayload['account']
  opportunity: {
    id: string
    crmOpportunityId: string
    name: string
    amountCents: number | null
    stage: string
  }
  motion: string
  supportTier: 'live'
  checkpoint: {
    id: string
    createdAt: string
  }
  riskScore: number
  meddpiccGaps: string[]
  risks: string[]
  nextActions: string[]
  sourceArtifactIds: string[]
}

export interface OpenGtmLeadDossierPayload {
  lead: {
    id: string
    crmLeadId: string
    name: string
    email: string | null
    status: string
  }
  account: {
    crmAccountId: string | null
    name: string | null
    domain: string | null
    stage: string | null
  }
  motion: string
  supportTier: 'live'
  checkpoint: {
    id: string
    createdAt: string
  }
  relationship: {
    state: 'customer' | 'warm-prospect' | 'cold-prospect'
    reason: string
  }
  preflight: {
    doNotSend: boolean
    recentOutreachCount: number
    latestOutreachSummary: string | null
    blockedReason: string | null
  }
  recommendedApproach: string
  sourceArtifactIds: string[]
}

export function buildDeterministicAccountDossier(input: {
  accountId: string
  crmAccountId: string
  name: string
  domain: string | null
  stage: string
  motion: string
  checkpoint: { id: string; createdAt: string }
  sourceArtifactIds: string[]
  evidence?: {
    accountActivityCount?: number
    opportunityCount?: number
  }
}): OpenGtmAccountDossierPayload {
  const accountActivityCount = input.evidence?.accountActivityCount ?? 0
  const opportunityCount = input.evidence?.opportunityCount ?? 0
  const adoption = Math.min(95, 45 + (accountActivityCount * 10) + (opportunityCount * 8))
  const support = Math.max(25, 65 - (accountActivityCount * 5))
  const engagement = Math.min(95, 40 + (accountActivityCount * 12))
  const score = Math.round((adoption * 0.4) + ((100 - support) * 0.2) + (engagement * 0.4))
  const trend = score >= 75 ? 'up' : score >= 60 ? 'flat' : 'down'

  return {
    account: {
      id: input.accountId,
      crmAccountId: input.crmAccountId,
      name: input.name,
      domain: input.domain,
      stage: input.stage
    },
    motion: input.motion,
    supportTier: 'live',
    checkpoint: input.checkpoint,
    health: {
      score,
      trend,
      components: {
        product_adoption: adoption,
        support_load: support,
        executive_engagement: engagement
      }
    },
    risks: [
      score < 70 ? 'Usage consistency needs improvement before the next executive review.' : 'Current account activity suggests stable renewal readiness.',
      support > 60 ? 'Support burden is elevated and should be reviewed before expansion pressure.' : 'Support burden is within the normal operating band.'
    ],
    opportunities: [
      adoption > 70 ? 'High product adoption supports a value-story follow-up.' : 'Adoption is still building; frame next steps around onboarding progress.',
      opportunityCount > 0 ? 'There is at least one active revenue motion tied to this account.' : 'No active revenue motion is currently attached to the account.'
    ],
    sourceArtifactIds: input.sourceArtifactIds
  }
}

export function persistAccountDossier(args: {
  storage: OpenGtmStorage
  workspaceId: string
  initiativeId: string
  accountName: string
  accountDomain: string | null
  crmAccountId: string
  checkpoint: { id: string; createdAt: string }
  sourceArtifactIds: string[]
  motion: string
  evidence?: {
    accountActivityCount?: number
    opportunityCount?: number
  }
}) {
  const account = createAccount({
    workspaceId: args.workspaceId,
    name: args.accountName,
    domain: args.accountDomain || `${slugify(args.accountName)}.example.com`,
    tier: 'standard',
    metadata: {
      crmAccountId: args.crmAccountId,
      motion: args.motion
    }
  })
  upsertRecord(args.storage, 'accounts', account)

  const dossier = buildDeterministicAccountDossier({
    accountId: account.id,
    crmAccountId: args.crmAccountId,
    name: args.accountName,
    domain: args.accountDomain,
    stage: 'customer',
    motion: args.motion,
    checkpoint: args.checkpoint,
    sourceArtifactIds: args.sourceArtifactIds,
    evidence: args.evidence
  })

  const artifact = createArtifactRecord({
    workspaceId: args.workspaceId,
    initiativeId: args.initiativeId,
    kind: 'analysis',
    lane: 'research',
    title: `Account dossier: ${args.accountName}`,
    provenance: ['opengtm:account-dossier', 'support-tier:live'],
    sourceIds: args.sourceArtifactIds
  })
  const artifactPath = writeArtifactBlob(args.storage, {
    workspaceSlug: 'global',
    artifactId: artifact.id,
    content: dossier as unknown as Record<string, unknown>
  })
  upsertRecord(args.storage, 'artifacts', {
    ...artifact,
    contentRef: artifactPath,
    sourceIds: args.sourceArtifactIds
  } as any)

  const memoryRecord = createMemoryRecord({
    workspaceId: args.workspaceId,
    memoryType: 'working',
    scope: `account:${account.id}`,
    contentRef: artifactPath,
    sourceIds: args.sourceArtifactIds,
    retrievalHints: [args.accountName, args.motion, 'account-dossier']
  })
  upsertRecord(args.storage, 'memory_records', memoryRecord)

  return {
    account,
    dossier,
    artifactId: artifact.id,
    artifactPath,
    memoryId: memoryRecord.id
  }
}

export function buildDeterministicDealDossier(input: {
  account: OpenGtmAccountDossierPayload['account']
  opportunityId: string
  crmOpportunityId: string
  opportunityName: string
  amountCents: number | null
  stage: string
  motion: string
  checkpoint: { id: string; createdAt: string }
  sourceArtifactIds: string[]
  evidence?: {
    opportunityActivityCount?: number
    accountActivityCount?: number
  }
}): OpenGtmDealDossierPayload {
  const opportunityActivityCount = input.evidence?.opportunityActivityCount ?? 0
  const accountActivityCount = input.evidence?.accountActivityCount ?? 0
  const riskScore = Math.max(20, 80 - (opportunityActivityCount * 12) - (accountActivityCount * 4))
  const meddpiccGaps = ['economic_buyer', 'decision_criteria', 'paper_process'].slice(0, Math.max(1, 3 - opportunityActivityCount))

  return {
    account: input.account,
    opportunity: {
      id: input.opportunityId,
      crmOpportunityId: input.crmOpportunityId,
      name: input.opportunityName,
      amountCents: input.amountCents,
      stage: input.stage
    },
    motion: input.motion,
    supportTier: 'live',
    checkpoint: input.checkpoint,
    riskScore,
    meddpiccGaps,
    risks: [
      riskScore > 60 ? 'Deal momentum is fragile and needs rep intervention.' : 'No acute deal risk detected in the current local fixture.',
      meddpiccGaps.length > 1 ? `MEDDPICC coverage is incomplete (${meddpiccGaps.join(', ')}).` : 'MEDDPICC coverage is within the current acceptable band.'
    ],
    nextActions: [
      'Validate champion strength before the next forecast review.',
      riskScore > 60 ? 'Escalate risk in the next AE sync.' : 'Continue monitoring the deal weekly.'
    ],
    sourceArtifactIds: input.sourceArtifactIds
  }
}

export function persistDealDossier(args: {
  storage: OpenGtmStorage
  workspaceId: string
  initiativeId: string
  accountName: string
  accountDomain: string | null
  crmAccountId: string
  opportunityName: string
  crmOpportunityId: string
  amountCents?: number | null
  checkpoint: { id: string; createdAt: string }
  sourceArtifactIds: string[]
  motion: string
  evidence?: {
    opportunityActivityCount?: number
    accountActivityCount?: number
  }
}) {
  const account = createAccount({
    workspaceId: args.workspaceId,
    name: args.accountName,
    domain: args.accountDomain || `${slugify(args.accountName)}.example.com`,
    tier: 'standard',
    metadata: {
      crmAccountId: args.crmAccountId,
      motion: args.motion
    }
  })
  upsertRecord(args.storage, 'accounts', account)

  const opportunity = createOpportunity({
    workspaceId: args.workspaceId,
    accountId: account.id,
    name: args.opportunityName,
    amountCents: args.amountCents ?? 1250000,
    stage: 'open',
    metadata: {
      crmOpportunityId: args.crmOpportunityId,
      motion: args.motion
    }
  })
  upsertRecord(args.storage, 'opportunities', opportunity)

  const dossier = buildDeterministicDealDossier({
    account: {
      id: account.id,
      crmAccountId: args.crmAccountId,
      name: args.accountName,
      domain: args.accountDomain,
      stage: 'customer'
    },
    opportunityId: opportunity.id,
    crmOpportunityId: args.crmOpportunityId,
    opportunityName: args.opportunityName,
    amountCents: opportunity.amountCents,
    stage: opportunity.stage,
    motion: args.motion,
    checkpoint: args.checkpoint,
    sourceArtifactIds: args.sourceArtifactIds,
    evidence: args.evidence
  })

  const artifact = createArtifactRecord({
    workspaceId: args.workspaceId,
    initiativeId: args.initiativeId,
    kind: 'analysis',
    lane: 'research',
    title: `Deal dossier: ${args.opportunityName}`,
    provenance: ['opengtm:deal-dossier', 'support-tier:live'],
    sourceIds: args.sourceArtifactIds
  })
  const artifactPath = writeArtifactBlob(args.storage, {
    workspaceSlug: 'global',
    artifactId: artifact.id,
    content: dossier as unknown as Record<string, unknown>
  })
  upsertRecord(args.storage, 'artifacts', {
    ...artifact,
    contentRef: artifactPath,
    sourceIds: args.sourceArtifactIds
  } as any)

  const memoryRecord = createMemoryRecord({
    workspaceId: args.workspaceId,
    memoryType: 'working',
    scope: `opportunity:${opportunity.id}`,
    contentRef: artifactPath,
    sourceIds: args.sourceArtifactIds,
    retrievalHints: [args.accountName, args.opportunityName, args.motion, 'deal-dossier']
  })
  upsertRecord(args.storage, 'memory_records', memoryRecord)

  return {
    account,
    opportunity,
    dossier,
    artifactId: artifact.id,
    artifactPath,
    memoryId: memoryRecord.id
  }
}

export function buildDeterministicLeadDossier(input: {
  leadId: string
  crmLeadId: string
  name: string
  email: string | null
  status: string
  account?: {
    crmAccountId: string
    name: string
    domain: string | null
    stage: string
  } | null
  checkpoint: { id: string; createdAt: string }
  sourceArtifactIds: string[]
  motion: string
  evidence?: {
    leadActivitySubjects?: string[]
    leadActivityTypes?: string[]
    accountActivitySubjects?: string[]
    accountActivityTypes?: string[]
  }
}): OpenGtmLeadDossierPayload {
  const leadActivitySubjects = input.evidence?.leadActivitySubjects ?? []
  const leadActivityTypes = input.evidence?.leadActivityTypes ?? []
  const accountActivitySubjects = input.evidence?.accountActivitySubjects ?? []
  const accountActivityTypes = input.evidence?.accountActivityTypes ?? []
  const relationshipState: OpenGtmLeadDossierPayload['relationship']['state'] =
    input.account?.stage === 'customer'
      ? 'customer'
      : (leadActivitySubjects.length + accountActivitySubjects.length) > 0
        ? 'warm-prospect'
        : 'cold-prospect'
  const relationshipReason = relationshipState === 'customer'
    ? 'Account stage is customer, so outreach should behave like an expansion or enablement follow-up.'
    : relationshipState === 'warm-prospect'
      ? 'Recent relationship signals already exist, so continue from prior context rather than acting cold.'
      : 'No prior relationship evidence is present, so treat this as a first-touch prospect motion.'
  const outreachSubjects = [...leadActivitySubjects, ...accountActivitySubjects]
    .filter((subject) => /approved outreach draft|outreach|follow-up/i.test(subject))
  const outreachTypes = [...leadActivityTypes, ...accountActivityTypes]
  const latestOutreachSummary = outreachSubjects[0] || null
  const doNotSend = outreachSubjects.length > 0 && outreachTypes.includes('email')
  const blockedReason = doNotSend
    ? 'Recent outbound activity already exists in the local CRM evidence; draft follow-through instead of another first-touch send.'
    : null
  const recommendedApproach = relationshipState === 'customer'
    ? 'Anchor the message in customer context, current usage, and an expansion or enablement angle.'
    : relationshipState === 'warm-prospect'
      ? 'Reference prior touchpoints and continue the warm thread with a light next-step ask.'
      : 'Use a concise first-touch value prop with a low-friction CTA.'

  return {
    lead: {
      id: input.leadId,
      crmLeadId: input.crmLeadId,
      name: input.name,
      email: input.email,
      status: input.status
    },
    account: {
      crmAccountId: input.account?.crmAccountId || null,
      name: input.account?.name || null,
      domain: input.account?.domain || null,
      stage: input.account?.stage || null
    },
    motion: input.motion,
    supportTier: 'live',
    checkpoint: input.checkpoint,
    relationship: {
      state: relationshipState,
      reason: relationshipReason
    },
    preflight: {
      doNotSend,
      recentOutreachCount: outreachSubjects.length,
      latestOutreachSummary,
      blockedReason
    },
    recommendedApproach,
    sourceArtifactIds: input.sourceArtifactIds
  }
}

export function persistLeadDossier(args: {
  storage: OpenGtmStorage
  workspaceId: string
  initiativeId: string
  leadName: string
  leadEmail: string | null
  crmLeadId: string
  checkpoint: { id: string; createdAt: string }
  sourceArtifactIds: string[]
  motion: string
  account?: {
    crmAccountId: string
    name: string
    domain: string | null
    stage: string
  } | null
  evidence?: {
    leadActivitySubjects?: string[]
    leadActivityTypes?: string[]
    accountActivitySubjects?: string[]
    accountActivityTypes?: string[]
  }
}) {
  const dossier = buildDeterministicLeadDossier({
    leadId: args.crmLeadId,
    crmLeadId: args.crmLeadId,
    name: args.leadName,
    email: args.leadEmail,
    status: 'new',
    account: args.account || null,
    checkpoint: args.checkpoint,
    sourceArtifactIds: args.sourceArtifactIds,
    motion: args.motion,
    evidence: args.evidence
  })

  const artifact = createArtifactRecord({
    workspaceId: args.workspaceId,
    initiativeId: args.initiativeId,
    kind: 'analysis',
    lane: 'research',
    title: `Lead dossier: ${args.leadName}`,
    provenance: ['opengtm:lead-dossier', 'support-tier:live'],
    sourceIds: args.sourceArtifactIds
  })
  const artifactPath = writeArtifactBlob(args.storage, {
    workspaceSlug: 'global',
    artifactId: artifact.id,
    content: dossier as unknown as Record<string, unknown>
  })
  upsertRecord(args.storage, 'artifacts', {
    ...artifact,
    contentRef: artifactPath,
    sourceIds: args.sourceArtifactIds
  } as any)

  const memoryRecord = createMemoryRecord({
    workspaceId: args.workspaceId,
    memoryType: 'working',
    scope: `lead:${args.crmLeadId}`,
    contentRef: artifactPath,
    sourceIds: args.sourceArtifactIds,
    retrievalHints: [args.leadName, args.motion, 'lead-dossier', dossier.relationship.state]
  })
  upsertRecord(args.storage, 'memory_records', memoryRecord)

  return {
    dossier,
    artifactId: artifact.id,
    artifactPath,
    memoryId: memoryRecord.id
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
