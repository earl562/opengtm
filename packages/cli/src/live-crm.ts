import { createArtifactRecord } from '@opengtm/core'
import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { createCheckpoint, upsertRecord, writeArtifactBlob } from '@opengtm/storage'
import {
  createCanonicalAccount,
  createCanonicalActivity,
  createCanonicalLead,
  createCanonicalOpportunity,
  resolveCanonicalCrmDbFile
} from './canonical-crm.js'

export async function bootstrapLiveCrmLeadContext(args: {
  daemon: OpenGtmLocalDaemon
  workflowId: string
  workflowRunId: string
  workspaceId: string
  initiativeId?: string
  leadName: string
  sourceTag: string
}) {
  const crmDbFile = resolveCanonicalCrmDbFile(args.daemon.storage.rootDir)
  const leadEmail = `${args.leadName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'lead'}@example.com`
  const lead = createCanonicalLead(crmDbFile, {
    name: args.leadName,
    email: leadEmail
  })
  const relationshipProfile = deriveLiveLeadRelationshipProfile(args.leadName)
  const account = createCanonicalAccount(crmDbFile, {
    name: relationshipProfile.accountName,
    domain: leadEmail.split('@')[1] || `${slugify(args.leadName)}.example.com`,
    stage: relationshipProfile.accountStage
  })
  for (const activity of relationshipProfile.activities) {
    createCanonicalActivity(crmDbFile, {
      subject: activity.subject.replace(/\{lead\}/g, lead.name).replace(/\{account\}/g, account.name),
      type: activity.type,
      relatedType: activity.relatedType,
      relatedId: activity.relatedType === 'account' ? account.id : lead.id
    })
  }

  const checkpoint = createCheckpoint(args.daemon.storage, {
    id: `${args.workflowRunId}-bootstrap`
  })

  const checkpointArtifact = createArtifactRecord({
    workspaceId: args.workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    kind: 'decision-log',
    lane: 'ops-automate',
    title: `Live CRM checkpoint: ${lead.name}`,
    provenance: [
      args.sourceTag,
      `workflow:${args.workflowId}`,
      'support-tier:live'
    ]
  })

  const checkpointArtifactPath = writeArtifactBlob(args.daemon.storage, {
    workspaceSlug: 'global',
    artifactId: checkpointArtifact.id,
    content: {
      workflowId: args.workflowId,
      checkpoint,
      lead,
      account,
      crmDbFile,
      supportTier: 'live'
    }
  })

  upsertRecord(args.daemon.storage, 'artifacts', {
    ...checkpointArtifact,
    contentRef: checkpointArtifactPath,
    traceRef: null,
    sourceIds: []
  } as any)

  return {
    crmDbFile,
    lead,
    account,
    checkpoint,
    checkpointArtifactId: checkpointArtifact.id
  }
}

function deriveLiveLeadRelationshipProfile(leadName: string) {
  const normalized = leadName.toLowerCase()
  if (normalized.includes('acme')) {
    return {
      accountName: leadName,
      accountStage: 'prospect' as const,
      activities: [
        { subject: 'Champion discovery call with {lead}', type: 'call' as const, relatedType: 'lead' as const },
        { subject: 'Mutual intro note for {account}', type: 'note' as const, relatedType: 'account' as const }
      ]
    }
  }

  if (leadName.trim().includes(' ')) {
    return {
      accountName: `${leadName.split(/\s+/).slice(-1)[0]} Team`,
      accountStage: 'prospect' as const,
      activities: [
        { subject: 'Prior discovery note for {lead}', type: 'note' as const, relatedType: 'lead' as const }
      ]
    }
  }

  return {
    accountName: `${leadName} Org`,
    accountStage: 'prospect' as const,
    activities: []
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function bootstrapLiveCrmAccountContext(args: {
  daemon: OpenGtmLocalDaemon
  workflowId: string
  workflowRunId: string
  workspaceId: string
  initiativeId?: string
  accountName: string
  sourceTag: string
}) {
  const crmDbFile = resolveCanonicalCrmDbFile(args.daemon.storage.rootDir)
  const accountDomain = `${args.accountName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'account'}.example.com`
  const account = createCanonicalAccount(crmDbFile, {
    name: args.accountName,
    domain: accountDomain,
    stage: 'customer'
  })
  createCanonicalActivity(crmDbFile, {
    subject: `Executive sponsor check-in for ${account.name}`,
    type: 'call',
    relatedType: 'account',
    relatedId: account.id
  })
  createCanonicalActivity(crmDbFile, {
    subject: `Weekly product usage review for ${account.name}`,
    type: 'note',
    relatedType: 'account',
    relatedId: account.id
  })

  const checkpoint = createCheckpoint(args.daemon.storage, {
    id: `${args.workflowRunId}-bootstrap`
  })

  const checkpointArtifact = createArtifactRecord({
    workspaceId: args.workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    kind: 'decision-log',
    lane: 'research',
    title: `Live CRM account checkpoint: ${account.name}`,
    provenance: [
      args.sourceTag,
      `workflow:${args.workflowId}`,
      'support-tier:live'
    ]
  })

  const checkpointArtifactPath = writeArtifactBlob(args.daemon.storage, {
    workspaceSlug: 'global',
    artifactId: checkpointArtifact.id,
    content: {
      workflowId: args.workflowId,
      checkpoint,
      account,
      crmDbFile,
      supportTier: 'live'
    }
  })

  upsertRecord(args.daemon.storage, 'artifacts', {
    ...checkpointArtifact,
    contentRef: checkpointArtifactPath,
    traceRef: null,
    sourceIds: []
  } as any)

  return {
    crmDbFile,
    account,
    checkpoint,
    checkpointArtifactId: checkpointArtifact.id
  }
}

export async function bootstrapLiveCrmDealContext(args: {
  daemon: OpenGtmLocalDaemon
  workflowId: string
  workflowRunId: string
  workspaceId: string
  initiativeId?: string
  accountName: string
  opportunityName: string
  sourceTag: string
}) {
  const base = await bootstrapLiveCrmAccountContext({
    daemon: args.daemon,
    workflowId: args.workflowId,
    workflowRunId: `${args.workflowRunId}-account`,
    workspaceId: args.workspaceId,
    initiativeId: args.initiativeId,
    accountName: args.accountName,
    sourceTag: args.sourceTag
  })

  const opportunity = createCanonicalOpportunity(base.crmDbFile, {
    accountId: base.account.id,
    name: args.opportunityName,
    amountCents: 1250000,
    stage: 'open'
  })
  createCanonicalActivity(base.crmDbFile, {
    subject: `Champion follow-up for ${opportunity.name}`,
    type: 'email',
    relatedType: 'opportunity',
    relatedId: opportunity.id
  })
  createCanonicalActivity(base.crmDbFile, {
    subject: `Forecast review for ${opportunity.name}`,
    type: 'call',
    relatedType: 'opportunity',
    relatedId: opportunity.id
  })

  return {
    ...base,
    opportunity
  }
}
