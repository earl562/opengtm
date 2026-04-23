import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import {
  collectCanonicalRuntimeEvidence,
  createCanonicalActivity,
  createCanonicalOpportunity,
  listCanonicalOpportunities
} from '../canonical-crm.js'
import { persistAccountDossier, persistDealDossier, persistLeadDossier } from '../dossiers.js'
import {
  bootstrapLiveCrmAccountContext,
  bootstrapLiveCrmDealContext,
  bootstrapLiveCrmLeadContext
} from '../live-crm.js'
import {
  entityMatches,
  uniqueArtifactIds,
  type OpenGtmAccountSessionLineage,
  type OpenGtmDealSessionLineage,
  type OpenGtmLeadSessionLineage,
  type OpenGtmSessionLineageState
} from '../session-lineage.js'
import { handleOpsRun } from './ops.js'
import { handleResearchRun } from './research.js'

type OpenGtmLeadBootstrap = Awaited<ReturnType<typeof bootstrapLiveCrmLeadContext>>
type OpenGtmAccountBootstrap = Awaited<ReturnType<typeof bootstrapLiveCrmAccountContext>>
type OpenGtmDealBootstrap = Awaited<ReturnType<typeof bootstrapLiveCrmDealContext>>

interface OpenGtmLiveWorkflowArgs {
  daemon: OpenGtmLocalDaemon
  cwd?: string
  goal?: string
  workspaceId?: string
  initiativeId?: string
  workflowId: string
  workflowRunId: string
  persona: string
  fixtureSetId: string
  sessionLineage?: OpenGtmSessionLineageState | null
}

function stripTaskPrefix(value: string, patterns: RegExp[]) {
  return patterns.reduce((current, pattern) => current.replace(pattern, '').trim(), value.trim())
}

function deriveLeadName(goal: string | undefined, fallback: string) {
  const value = stripTaskPrefix(goal || '', [
    /^(lead research|research lead|outreach compose|outreach sequence)\s+(for\s+)?/i,
    /^(research|investigate|look into|find)\s+/i,
    /^(draft|write|compose)\s+(outreach|email|message)\s+(for\s+)?/i
  ])
  return value || fallback
}

function deriveAccountName(goal: string | undefined, fallback: string) {
  const value = stripTaskPrefix(goal || '', [
    /^(check|show|assess|generate|create|prepare|brief|find|scan|analyze)\s+/i,
    /^(account health|health score|account brief|brief|renewal|renewal prep|expansion signal|expansion signals|expansion opportunity|expansion opportunities|deal risk|risk|usage analytics|usage|product usage)\s*/i,
    /^for\s+/i
  ])
  return value || fallback
}

function findMatchingLeadLineage(sessionLineage: OpenGtmSessionLineageState | null | undefined, entityName: string) {
  const lead = sessionLineage?.lead || null
  return lead && entityMatches(lead.entityName, entityName) ? lead : null
}

function findMatchingAccountLineage(sessionLineage: OpenGtmSessionLineageState | null | undefined, entityName: string) {
  const account = sessionLineage?.account || null
  return account && entityMatches(account.entityName, entityName) ? account : null
}

function findMatchingDealLineage(sessionLineage: OpenGtmSessionLineageState | null | undefined, entityName: string) {
  const deal = sessionLineage?.deal || null
  return deal && (entityMatches(deal.entityName, entityName) || entityMatches(deal.account.name, entityName)) ? deal : null
}

function leadBootstrapFromLineage(lineage: OpenGtmLeadSessionLineage): OpenGtmLeadBootstrap {
  return {
    crmDbFile: lineage.crmDbFile,
    lead: { ...lineage.lead },
    account: lineage.account
      ? { ...lineage.account }
      : {
          id: lineage.lead.id,
          name: `${lineage.entityName} Org`,
          domain: lineage.lead.email?.split('@')[1] || null,
          stage: 'prospect',
          createdAt: lineage.lead.createdAt
        },
    checkpoint: { ...lineage.checkpoint },
    checkpointArtifactId: lineage.checkpointArtifactId
  }
}

function accountBootstrapFromLineage(lineage: OpenGtmAccountSessionLineage): OpenGtmAccountBootstrap {
  return {
    crmDbFile: lineage.crmDbFile,
    account: { ...lineage.account },
    checkpoint: { ...lineage.checkpoint },
    checkpointArtifactId: lineage.checkpointArtifactId
  }
}

function dealBootstrapFromLineage(lineage: OpenGtmDealSessionLineage): OpenGtmDealBootstrap {
  return {
    crmDbFile: lineage.crmDbFile,
    account: { ...lineage.account },
    checkpoint: { ...lineage.checkpoint },
    checkpointArtifactId: lineage.checkpointArtifactId,
    opportunity: { ...lineage.opportunity }
  }
}

function seedDealBootstrapFromAccountLineage(lineage: OpenGtmAccountSessionLineage): OpenGtmDealBootstrap {
  const opportunity = createCanonicalOpportunity(lineage.crmDbFile, {
    accountId: lineage.account.id,
    name: `${lineage.account.name} Renewal`,
    amountCents: 1250000,
    stage: 'open'
  })
  createCanonicalActivity(lineage.crmDbFile, {
    subject: `Champion follow-up for ${opportunity.name}`,
    type: 'email',
    relatedType: 'opportunity',
    relatedId: opportunity.id
  })
  createCanonicalActivity(lineage.crmDbFile, {
    subject: `Forecast review for ${opportunity.name}`,
    type: 'call',
    relatedType: 'opportunity',
    relatedId: opportunity.id
  })

  return {
    crmDbFile: lineage.crmDbFile,
    account: { ...lineage.account },
    checkpoint: { ...lineage.checkpoint },
    checkpointArtifactId: lineage.checkpointArtifactId,
    opportunity
  }
}

function buildLeadLineage(
  bootstrap: OpenGtmLeadBootstrap,
  result: { artifactId?: string | null; memoryId?: string | null },
  inheritedSourceIds: string[] = []
): OpenGtmLeadSessionLineage {
  return {
    kind: 'lead',
    entityName: bootstrap.lead.name,
    crmDbFile: bootstrap.crmDbFile,
    lead: { ...bootstrap.lead },
    account: { ...bootstrap.account },
    checkpoint: { ...bootstrap.checkpoint },
    checkpointArtifactId: bootstrap.checkpointArtifactId,
    sourceArtifactIds: uniqueArtifactIds([
      ...inheritedSourceIds,
      bootstrap.checkpointArtifactId,
      result.artifactId,
      result.memoryId
    ]),
    lastArtifactId: result.artifactId || null,
    lastMemoryId: result.memoryId || null
  }
}

function buildAccountLineage(
  bootstrap: OpenGtmAccountBootstrap,
  result: { artifactId?: string | null; memoryId?: string | null },
  inheritedSourceIds: string[] = []
): OpenGtmAccountSessionLineage {
  return {
    kind: 'account',
    entityName: bootstrap.account.name,
    crmDbFile: bootstrap.crmDbFile,
    account: { ...bootstrap.account },
    checkpoint: { ...bootstrap.checkpoint },
    checkpointArtifactId: bootstrap.checkpointArtifactId,
    sourceArtifactIds: uniqueArtifactIds([
      ...inheritedSourceIds,
      bootstrap.checkpointArtifactId,
      result.artifactId,
      result.memoryId
    ]),
    dossierArtifactId: result.artifactId || null,
    dossierMemoryId: result.memoryId || null
  }
}

function buildDealLineage(
  bootstrap: OpenGtmDealBootstrap,
  result: { artifactId?: string | null; memoryId?: string | null },
  inheritedSourceIds: string[] = []
): OpenGtmDealSessionLineage {
  return {
    kind: 'deal',
    entityName: bootstrap.opportunity.name,
    crmDbFile: bootstrap.crmDbFile,
    account: { ...bootstrap.account },
    opportunity: { ...bootstrap.opportunity },
    checkpoint: { ...bootstrap.checkpoint },
    checkpointArtifactId: bootstrap.checkpointArtifactId,
    sourceArtifactIds: uniqueArtifactIds([
      ...inheritedSourceIds,
      bootstrap.checkpointArtifactId,
      result.artifactId,
      result.memoryId
    ]),
    dossierArtifactId: result.artifactId || null,
    dossierMemoryId: result.memoryId || null
  }
}

async function runLiveHealthFromAccountContext(args: {
  daemon: OpenGtmLocalDaemon
  cwd?: string
  workspaceId: string
  initiativeId?: string
  workflowId: string
  workflowRunId: string
  persona: string
  fixtureSetId: string
  bootstrap: OpenGtmAccountBootstrap
  seedSourceIds?: string[]
}) {
  const inheritedSourceIds = uniqueArtifactIds([
    ...(args.seedSourceIds || []),
    args.bootstrap.checkpointArtifactId
  ])

  const research = await handleResearchRun({
    daemon: args.daemon,
    cwd: args.cwd,
    goal: `Compute account health for ${args.bootstrap.account.name}`,
    workspaceId: args.workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    sourceIds: inheritedSourceIds,
    connectorTargets: [
      `crm-db:${args.bootstrap.crmDbFile}`,
      `crm-account:${args.bootstrap.account.id}`,
      `checkpoint:${args.bootstrap.checkpoint.id}`,
      `checkpoint-at:${args.bootstrap.checkpoint.createdAt}`
    ],
    supportTier: 'live',
    checkpointId: args.bootstrap.checkpoint.id
  })

  const dossierSourceIds = uniqueArtifactIds([...inheritedSourceIds, research.artifactId])
  const dossier = persistAccountDossier({
    storage: args.daemon.storage,
    workspaceId: args.workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    accountName: args.bootstrap.account.name,
    accountDomain: args.bootstrap.account.domain,
    crmAccountId: args.bootstrap.account.id,
    checkpoint: args.bootstrap.checkpoint,
    sourceArtifactIds: dossierSourceIds,
    motion: 'health_score',
    evidence: {
      accountActivityCount: collectCanonicalRuntimeEvidence({
        dbFile: args.bootstrap.crmDbFile,
        accountId: args.bootstrap.account.id
      }).activities.account.length,
      opportunityCount: listCanonicalOpportunities(args.bootstrap.crmDbFile)
        .filter((item) => item.accountId === args.bootstrap.account.id)
        .length
    }
  })

  return {
    ...research,
    artifactId: dossier.artifactId,
    artifactPath: dossier.artifactPath,
    memoryId: dossier.memoryId,
    dossierArtifactId: dossier.artifactId,
    dossierMemoryId: dossier.memoryId,
    sourceArtifactIds: uniqueArtifactIds([...dossierSourceIds, dossier.artifactId, dossier.memoryId])
  }
}

export async function handleLiveLeadResearchWorkflow(args: OpenGtmLiveWorkflowArgs) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const leadName = deriveLeadName(args.goal, 'Live Research Lead')
  const seededLead = findMatchingLeadLineage(args.sessionLineage, leadName)
  const bootstrap = seededLead
    ? leadBootstrapFromLineage(seededLead)
    : await bootstrapLiveCrmLeadContext({
        daemon: args.daemon,
        workflowId: args.workflowId,
        workflowRunId: args.workflowRunId,
        workspaceId,
        initiativeId: args.initiativeId,
        leadName,
        sourceTag: 'opengtm:live-lead-research'
      })

  const inheritedSourceIds = uniqueArtifactIds([
    ...(seededLead?.sourceArtifactIds || []),
    bootstrap.checkpointArtifactId
  ])
  const research = await handleResearchRun({
    daemon: args.daemon,
    cwd: args.cwd,
    goal: `Research CRM lead ${bootstrap.lead.name} (${bootstrap.lead.email}) for outreach readiness`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    sourceIds: inheritedSourceIds,
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-lead:${bootstrap.lead.id}`,
      `crm-account:${bootstrap.account.id}`,
      `checkpoint:${bootstrap.checkpoint.id}`,
      `checkpoint-at:${bootstrap.checkpoint.createdAt}`
    ],
    supportTier: 'live',
    checkpointId: bootstrap.checkpoint.id
  })
  const evidence = collectCanonicalRuntimeEvidence({
    dbFile: bootstrap.crmDbFile,
    leadId: bootstrap.lead.id,
    accountId: bootstrap.account.id
  })
  const dossier = persistLeadDossier({
    storage: args.daemon.storage,
    workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    leadName: bootstrap.lead.name,
    leadEmail: bootstrap.lead.email,
    crmLeadId: bootstrap.lead.id,
    checkpoint: bootstrap.checkpoint,
    sourceArtifactIds: uniqueArtifactIds([...inheritedSourceIds, research.artifactId, research.memoryId]),
    motion: 'lead_research',
    account: {
      crmAccountId: bootstrap.account.id,
      name: bootstrap.account.name,
      domain: bootstrap.account.domain,
      stage: bootstrap.account.stage
    },
    evidence: {
      leadActivitySubjects: evidence.activities.lead.map((activity) => activity.subject),
      leadActivityTypes: evidence.activities.lead.map((activity) => activity.type),
      accountActivitySubjects: evidence.activities.account.map((activity) => activity.subject),
      accountActivityTypes: evidence.activities.account.map((activity) => activity.type)
    }
  })

  return {
    ...research,
    artifactId: dossier.artifactId,
    artifactPath: dossier.artifactPath,
    memoryId: dossier.memoryId,
    nextAction: dossier.dossier.preflight.doNotSend
      ? dossier.dossier.preflight.blockedReason || 'Inspect recent outreach activity before drafting another send.'
      : `Relationship state: ${dossier.dossier.relationship.state}. ${dossier.dossier.recommendedApproach}`,
    lineageUpdate: {
      lead: buildLeadLineage(bootstrap, {
        artifactId: dossier.artifactId,
        memoryId: dossier.memoryId
      }, uniqueArtifactIds([...inheritedSourceIds, research.artifactId, research.memoryId, dossier.artifactId, dossier.memoryId]))
    }
  }
}

export async function handleLiveOutreachComposeWorkflow(args: OpenGtmLiveWorkflowArgs) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const leadName = deriveLeadName(args.goal, 'Live Outreach Lead')
  const seededLead = findMatchingLeadLineage(args.sessionLineage, leadName)
  const bootstrap = seededLead
    ? leadBootstrapFromLineage(seededLead)
    : await bootstrapLiveCrmLeadContext({
        daemon: args.daemon,
        workflowId: args.workflowId,
        workflowRunId: args.workflowRunId,
        workspaceId,
        initiativeId: args.initiativeId,
        leadName,
        sourceTag: 'opengtm:live-outreach-compose'
      })

  const inheritedSourceIds = uniqueArtifactIds([
    ...(seededLead?.sourceArtifactIds || []),
    bootstrap.checkpointArtifactId
  ])
  const ops = await handleOpsRun({
    daemon: args.daemon,
    cwd: args.cwd,
    goal: `Compose first-touch outreach for ${bootstrap.lead.name}`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    requiresApproval: true,
    sourceIds: inheritedSourceIds,
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-lead:${bootstrap.lead.id}`,
      `crm-account:${bootstrap.account.id}`,
      `checkpoint:${bootstrap.checkpoint.id}`,
      `checkpoint-at:${bootstrap.checkpoint.createdAt}`
    ],
    supportTier: 'live'
  })

  return {
    ...ops,
    lineageUpdate: {
      lead: buildLeadLineage(bootstrap, ops, inheritedSourceIds)
    }
  }
}

export async function handleLiveOutreachSequenceWorkflow(args: OpenGtmLiveWorkflowArgs) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const leadName = deriveLeadName(args.goal, 'Live Outreach Sequence Lead')
  const seededLead = findMatchingLeadLineage(args.sessionLineage, leadName)
  const bootstrap = seededLead
    ? leadBootstrapFromLineage(seededLead)
    : await bootstrapLiveCrmLeadContext({
        daemon: args.daemon,
        workflowId: args.workflowId,
        workflowRunId: args.workflowRunId,
        workspaceId,
        initiativeId: args.initiativeId,
        leadName,
        sourceTag: 'opengtm:live-outreach-sequence'
      })

  const inheritedSourceIds = uniqueArtifactIds([
    ...(seededLead?.sourceArtifactIds || []),
    bootstrap.checkpointArtifactId
  ])
  const ops = await handleOpsRun({
    daemon: args.daemon,
    cwd: args.cwd,
    goal: `Prepare sequenced outreach plan for ${bootstrap.lead.name}`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    requiresApproval: true,
    sourceIds: inheritedSourceIds,
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-lead:${bootstrap.lead.id}`,
      `crm-account:${bootstrap.account.id}`,
      `checkpoint:${bootstrap.checkpoint.id}`,
      `checkpoint-at:${bootstrap.checkpoint.createdAt}`
    ],
    supportTier: 'live'
  })

  return {
    ...ops,
    lineageUpdate: {
      lead: buildLeadLineage(bootstrap, ops, inheritedSourceIds)
    },
    nextAction: 'Review the outreach sequence draft and approve the sequenced motion before it continues.'
  }
}

export async function handleLiveInboundTriageWorkflow(args: OpenGtmLiveWorkflowArgs) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const leadName = deriveLeadName(args.goal, 'Live Inbound Lead')
  const seededLead = findMatchingLeadLineage(args.sessionLineage, leadName)
  const bootstrap = seededLead
    ? leadBootstrapFromLineage(seededLead)
    : await bootstrapLiveCrmLeadContext({
        daemon: args.daemon,
        workflowId: args.workflowId,
        workflowRunId: args.workflowRunId,
        workspaceId,
        initiativeId: args.initiativeId,
        leadName,
        sourceTag: 'opengtm:live-inbound-triage'
      })

  const inheritedSourceIds = uniqueArtifactIds([
    ...(seededLead?.sourceArtifactIds || []),
    bootstrap.checkpointArtifactId
  ])
  const ops = await handleOpsRun({
    daemon: args.daemon,
    cwd: args.cwd,
    goal: `Triage inbound lead ${bootstrap.lead.name}`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    requiresApproval: false,
    sourceIds: inheritedSourceIds,
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-lead:${bootstrap.lead.id}`,
      `checkpoint:${bootstrap.checkpoint.id}`,
      `checkpoint-at:${bootstrap.checkpoint.createdAt}`
    ],
    supportTier: 'live'
  })

  return {
    ...ops,
    lineageUpdate: {
      lead: buildLeadLineage(bootstrap, ops, inheritedSourceIds)
    },
    nextAction: 'Review the inbound triage artifact and route the lead into research, outreach, or a direct handoff.'
  }
}

export async function handleLiveHealthScoreWorkflow(args: OpenGtmLiveWorkflowArgs) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const accountName = deriveAccountName(args.goal, 'Live Health Account')
  const seededAccount = findMatchingAccountLineage(args.sessionLineage, accountName)
  const bootstrap = seededAccount
    ? accountBootstrapFromLineage(seededAccount)
    : await bootstrapLiveCrmAccountContext({
        daemon: args.daemon,
        workflowId: args.workflowId,
        workflowRunId: args.workflowRunId,
        workspaceId,
        initiativeId: args.initiativeId,
        accountName,
        sourceTag: 'opengtm:live-health-score'
      })

  const health = await runLiveHealthFromAccountContext({
    ...args,
    workspaceId,
    bootstrap,
    seedSourceIds: seededAccount?.sourceArtifactIds
  })

  return {
    ...health,
    nextAction: 'Review the account dossier and continue into renewal or expansion planning if needed.',
    lineageUpdate: {
      account: buildAccountLineage(bootstrap, health, health.sourceArtifactIds)
    }
  }
}

export async function handleLiveRenewalPrepWorkflow(args: OpenGtmLiveWorkflowArgs) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const accountName = deriveAccountName(args.goal, 'Live Renewal Account')
  const seededAccount = findMatchingAccountLineage(args.sessionLineage, accountName)
  const bootstrap = seededAccount
    ? accountBootstrapFromLineage(seededAccount)
    : await bootstrapLiveCrmAccountContext({
        daemon: args.daemon,
        workflowId: args.workflowId,
        workflowRunId: args.workflowRunId,
        workspaceId,
        initiativeId: args.initiativeId,
        accountName,
        sourceTag: 'opengtm:live-renewal-prep'
      })

  const health = await runLiveHealthFromAccountContext({
    cwd: args.cwd,
    daemon: args.daemon,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: 'cs.health_score',
    workflowRunId: `${args.workflowRunId}-health`,
    persona: args.persona,
    fixtureSetId: 'cs-health-score',
    bootstrap,
    seedSourceIds: seededAccount?.sourceArtifactIds
  })

  const researchSourceIds = uniqueArtifactIds([...health.sourceArtifactIds, health.artifactId])
  const research = await handleResearchRun({
    daemon: args.daemon,
    cwd: args.cwd,
    goal: `Prepare renewal brief for ${bootstrap.account.name}`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    sourceIds: researchSourceIds,
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-account:${bootstrap.account.id}`,
      `checkpoint:${bootstrap.checkpoint.id}`,
      `checkpoint-at:${bootstrap.checkpoint.createdAt}`
    ],
    supportTier: 'live',
    checkpointId: bootstrap.checkpoint.id
  })

  const dossier = persistAccountDossier({
    storage: args.daemon.storage,
    workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    accountName: bootstrap.account.name,
    accountDomain: bootstrap.account.domain,
    crmAccountId: bootstrap.account.id,
    checkpoint: bootstrap.checkpoint,
    sourceArtifactIds: uniqueArtifactIds([...researchSourceIds, research.artifactId]),
    motion: 'renewal_prep',
    evidence: {
      accountActivityCount: collectCanonicalRuntimeEvidence({
        dbFile: bootstrap.crmDbFile,
        accountId: bootstrap.account.id
      }).activities.account.length,
      opportunityCount: listCanonicalOpportunities(bootstrap.crmDbFile)
        .filter((item) => item.accountId === bootstrap.account.id)
        .length
    }
  })

  return {
    ...research,
    artifactId: dossier.artifactId,
    artifactPath: dossier.artifactPath,
    memoryId: dossier.memoryId,
    nextAction: 'Review the renewal dossier and decide whether to escalate, renew, or stabilize the account motion.',
    lineageUpdate: {
      account: buildAccountLineage(
        bootstrap,
        { artifactId: dossier.artifactId, memoryId: dossier.memoryId },
        uniqueArtifactIds([...researchSourceIds, research.artifactId])
      )
    }
  }
}

export async function handleLiveExpansionSignalWorkflow(args: OpenGtmLiveWorkflowArgs) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const accountName = deriveAccountName(args.goal, 'Live Expansion Account')
  const seededAccount = findMatchingAccountLineage(args.sessionLineage, accountName)
  const bootstrap = seededAccount
    ? accountBootstrapFromLineage(seededAccount)
    : await bootstrapLiveCrmAccountContext({
        daemon: args.daemon,
        workflowId: args.workflowId,
        workflowRunId: args.workflowRunId,
        workspaceId,
        initiativeId: args.initiativeId,
        accountName,
        sourceTag: 'opengtm:live-expansion-signal'
      })

  const health = await runLiveHealthFromAccountContext({
    cwd: args.cwd,
    daemon: args.daemon,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: 'cs.health_score',
    workflowRunId: `${args.workflowRunId}-health`,
    persona: args.persona,
    fixtureSetId: 'cs-health-score',
    bootstrap,
    seedSourceIds: seededAccount?.sourceArtifactIds
  })

  const researchSourceIds = uniqueArtifactIds([...health.sourceArtifactIds, health.artifactId])
  const research = await handleResearchRun({
    daemon: args.daemon,
    cwd: args.cwd,
    goal: `Find expansion signals for ${bootstrap.account.name}`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    sourceIds: researchSourceIds,
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-account:${bootstrap.account.id}`,
      `checkpoint:${bootstrap.checkpoint.id}`,
      `checkpoint-at:${bootstrap.checkpoint.createdAt}`
    ],
    supportTier: 'live',
    checkpointId: bootstrap.checkpoint.id
  })

  const dossier = persistAccountDossier({
    storage: args.daemon.storage,
    workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    accountName: bootstrap.account.name,
    accountDomain: bootstrap.account.domain,
    crmAccountId: bootstrap.account.id,
    checkpoint: bootstrap.checkpoint,
    sourceArtifactIds: uniqueArtifactIds([...researchSourceIds, research.artifactId]),
    motion: 'expansion_signal',
    evidence: {
      accountActivityCount: collectCanonicalRuntimeEvidence({
        dbFile: bootstrap.crmDbFile,
        accountId: bootstrap.account.id
      }).activities.account.length,
      opportunityCount: listCanonicalOpportunities(bootstrap.crmDbFile)
        .filter((item) => item.accountId === bootstrap.account.id)
        .length
    }
  })

  return {
    ...research,
    artifactId: dossier.artifactId,
    artifactPath: dossier.artifactPath,
    memoryId: dossier.memoryId,
    nextAction: 'Review the expansion dossier and decide whether the account is ready for a coordinated AE/CS expansion motion.',
    lineageUpdate: {
      account: buildAccountLineage(
        bootstrap,
        { artifactId: dossier.artifactId, memoryId: dossier.memoryId },
        uniqueArtifactIds([...researchSourceIds, research.artifactId])
      )
    }
  }
}

export async function handleLiveAccountBriefWorkflow(args: OpenGtmLiveWorkflowArgs) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const accountName = deriveAccountName(args.goal, 'Live Account Brief Account')
  const seededAccount = findMatchingAccountLineage(args.sessionLineage, accountName)
  const bootstrap = seededAccount
    ? accountBootstrapFromLineage(seededAccount)
    : await bootstrapLiveCrmAccountContext({
        daemon: args.daemon,
        workflowId: args.workflowId,
        workflowRunId: args.workflowRunId,
        workspaceId,
        initiativeId: args.initiativeId,
        accountName,
        sourceTag: 'opengtm:live-account-brief'
      })

  const health = await runLiveHealthFromAccountContext({
    cwd: args.cwd,
    daemon: args.daemon,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: 'cs.health_score',
    workflowRunId: `${args.workflowRunId}-health`,
    persona: args.persona,
    fixtureSetId: 'cs-health-score',
    bootstrap,
    seedSourceIds: seededAccount?.sourceArtifactIds
  })

  const researchSourceIds = uniqueArtifactIds([...health.sourceArtifactIds, health.artifactId])
  const research = await handleResearchRun({
    daemon: args.daemon,
    cwd: args.cwd,
    goal: `Generate account brief for ${bootstrap.account.name}`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    sourceIds: researchSourceIds,
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-account:${bootstrap.account.id}`,
      `checkpoint:${bootstrap.checkpoint.id}`,
      `checkpoint-at:${bootstrap.checkpoint.createdAt}`
    ],
    supportTier: 'live',
    checkpointId: bootstrap.checkpoint.id
  })

  const dossier = persistAccountDossier({
    storage: args.daemon.storage,
    workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    accountName: bootstrap.account.name,
    accountDomain: bootstrap.account.domain,
    crmAccountId: bootstrap.account.id,
    checkpoint: bootstrap.checkpoint,
    sourceArtifactIds: uniqueArtifactIds([...researchSourceIds, research.artifactId]),
    motion: 'account_brief',
    evidence: {
      accountActivityCount: collectCanonicalRuntimeEvidence({
        dbFile: bootstrap.crmDbFile,
        accountId: bootstrap.account.id
      }).activities.account.length,
      opportunityCount: listCanonicalOpportunities(bootstrap.crmDbFile)
        .filter((item) => item.accountId === bootstrap.account.id)
        .length
    }
  })

  return {
    ...research,
    artifactId: dossier.artifactId,
    artifactPath: dossier.artifactPath,
    memoryId: dossier.memoryId,
    nextAction: 'Review the account brief dossier and decide whether the AE should act, wait, or request deeper research.',
    lineageUpdate: {
      account: buildAccountLineage(
        bootstrap,
        { artifactId: dossier.artifactId, memoryId: dossier.memoryId },
        uniqueArtifactIds([...researchSourceIds, research.artifactId])
      )
    }
  }
}

export async function handleLiveDealRiskWorkflow(args: OpenGtmLiveWorkflowArgs) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const accountName = deriveAccountName(args.goal, 'Live Deal Risk Account')
  const seededDeal = findMatchingDealLineage(args.sessionLineage, accountName)
  const seededAccount = findMatchingAccountLineage(args.sessionLineage, accountName)
  const bootstrap = seededDeal
    ? dealBootstrapFromLineage(seededDeal)
    : seededAccount
      ? seedDealBootstrapFromAccountLineage(seededAccount)
      : await bootstrapLiveCrmDealContext({
          daemon: args.daemon,
          workflowId: args.workflowId,
          workflowRunId: args.workflowRunId,
          workspaceId,
          initiativeId: args.initiativeId,
          accountName,
          opportunityName: `${accountName} Renewal`,
          sourceTag: 'opengtm:live-deal-risk'
        })

  const inheritedSourceIds = uniqueArtifactIds([
    ...(seededDeal?.sourceArtifactIds || []),
    ...(seededAccount?.sourceArtifactIds || []),
    bootstrap.checkpointArtifactId
  ])
  const health = await runLiveHealthFromAccountContext({
    cwd: args.cwd,
    daemon: args.daemon,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: 'cs.health_score',
    workflowRunId: `${args.workflowRunId}-health`,
    persona: args.persona,
    fixtureSetId: 'cs-health-score',
    bootstrap,
    seedSourceIds: inheritedSourceIds
  })

  const researchSourceIds = uniqueArtifactIds([...health.sourceArtifactIds, health.artifactId])
  const research = await handleResearchRun({
    daemon: args.daemon,
    cwd: args.cwd,
    goal: `Scan deal risk for ${bootstrap.opportunity.name}`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    sourceIds: researchSourceIds,
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-account:${bootstrap.account.id}`,
      `crm-opportunity:${bootstrap.opportunity.id}`,
      `checkpoint:${bootstrap.checkpoint.id}`,
      `checkpoint-at:${bootstrap.checkpoint.createdAt}`
    ],
    supportTier: 'live',
    checkpointId: bootstrap.checkpoint.id
  })

  const dossier = persistDealDossier({
    storage: args.daemon.storage,
    workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    accountName: bootstrap.account.name,
    accountDomain: bootstrap.account.domain,
    crmAccountId: bootstrap.account.id,
    opportunityName: bootstrap.opportunity.name,
    crmOpportunityId: bootstrap.opportunity.id,
    amountCents: bootstrap.opportunity.amountCents,
    checkpoint: bootstrap.checkpoint,
    sourceArtifactIds: uniqueArtifactIds([...researchSourceIds, research.artifactId]),
    motion: 'deal_risk_scan',
    evidence: {
      accountActivityCount: collectCanonicalRuntimeEvidence({
        dbFile: bootstrap.crmDbFile,
        accountId: bootstrap.account.id,
        opportunityId: bootstrap.opportunity.id
      }).activities.account.length,
      opportunityActivityCount: collectCanonicalRuntimeEvidence({
        dbFile: bootstrap.crmDbFile,
        opportunityId: bootstrap.opportunity.id
      }).activities.opportunity.length
    }
  })

  return {
    ...research,
    artifactId: dossier.artifactId,
    artifactPath: dossier.artifactPath,
    memoryId: dossier.memoryId,
    nextAction: 'Review the deal dossier and decide whether to intervene, escalate, or continue monitoring the opportunity.',
    lineageUpdate: {
      account: buildAccountLineage(
        bootstrap,
        { artifactId: health.dossierArtifactId, memoryId: health.dossierMemoryId },
        health.sourceArtifactIds
      ),
      deal: buildDealLineage(
        bootstrap,
        { artifactId: dossier.artifactId, memoryId: dossier.memoryId },
        uniqueArtifactIds([...researchSourceIds, research.artifactId])
      )
    }
  }
}

export async function handleLiveUsageAnalyticsWorkflow(args: OpenGtmLiveWorkflowArgs) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const accountName = deriveAccountName(args.goal, 'Live Usage Account')
  const seededAccount = findMatchingAccountLineage(args.sessionLineage, accountName)
  const bootstrap = seededAccount
    ? accountBootstrapFromLineage(seededAccount)
    : await bootstrapLiveCrmAccountContext({
        daemon: args.daemon,
        workflowId: args.workflowId,
        workflowRunId: args.workflowRunId,
        workspaceId,
        initiativeId: args.initiativeId,
        accountName,
        sourceTag: 'opengtm:live-usage-analytics'
      })

  const inheritedSourceIds = uniqueArtifactIds([
    ...(seededAccount?.sourceArtifactIds || []),
    bootstrap.checkpointArtifactId
  ])
  const research = await handleResearchRun({
    daemon: args.daemon,
    cwd: args.cwd,
    goal: `Analyze product usage for ${bootstrap.account.name}`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    sourceIds: inheritedSourceIds,
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-account:${bootstrap.account.id}`,
      `checkpoint:${bootstrap.checkpoint.id}`,
      `checkpoint-at:${bootstrap.checkpoint.createdAt}`
    ],
    supportTier: 'live',
    checkpointId: bootstrap.checkpoint.id
  })

  const dossier = persistAccountDossier({
    storage: args.daemon.storage,
    workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    accountName: bootstrap.account.name,
    accountDomain: bootstrap.account.domain,
    crmAccountId: bootstrap.account.id,
    checkpoint: bootstrap.checkpoint,
    sourceArtifactIds: uniqueArtifactIds([...inheritedSourceIds, research.artifactId]),
    motion: 'usage_analytics',
    evidence: {
      accountActivityCount: collectCanonicalRuntimeEvidence({
        dbFile: bootstrap.crmDbFile,
        accountId: bootstrap.account.id
      }).activities.account.length,
      opportunityCount: listCanonicalOpportunities(bootstrap.crmDbFile)
        .filter((item) => item.accountId === bootstrap.account.id)
        .length
    }
  })

  return {
    ...research,
    artifactId: dossier.artifactId,
    artifactPath: dossier.artifactPath,
    memoryId: dossier.memoryId,
    nextAction: 'Review the usage dossier and decide whether the account needs adoption work, expansion follow-up, or risk mitigation.',
    lineageUpdate: {
      account: buildAccountLineage(
        bootstrap,
        { artifactId: dossier.artifactId, memoryId: dossier.memoryId },
        uniqueArtifactIds([...inheritedSourceIds, research.artifactId])
      )
    }
  }
}
