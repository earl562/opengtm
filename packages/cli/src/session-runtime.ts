import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createLocalDaemon } from '@opengtm/daemon'
import { createArtifactRecord } from '@opengtm/core'
import { createCheckpoint, upsertRecord, writeArtifactBlob } from '@opengtm/storage'
import { DEFAULT_RUNTIME_DIR, loadOpenGtmConfig } from './config.js'
import type { OpenGtmInteractiveSession } from './interactive.js'
import { uniqueArtifactIds } from './session-lineage.js'
import type { OpenGtmSessionPlan } from './session-supervisor.js'
import { bootstrapLiveCrmLeadContext } from './live-crm.js'
import { collectCanonicalRuntimeEvidence, listCanonicalOpportunities } from './canonical-crm.js'
import { persistAccountDossier, persistDealDossier, persistLeadDossier } from './dossiers.js'
import { handleResearchRun } from './handlers/research.js'
import { handleOpsRun } from './handlers/ops.js'
import { bootstrapLiveCrmAccountContext, bootstrapLiveCrmDealContext } from './live-crm.js'

export function isLinkedLeadMotionPlan(plan: OpenGtmSessionPlan) {
  if (plan.steps.length !== 2) return false
  return plan.steps[0]?.intent.kind === 'research-account'
    && plan.steps[1]?.intent.kind === 'draft-outreach'
    && Boolean(plan.entity)
}

export function isLinkedAccountMotionPlan(plan: OpenGtmSessionPlan) {
  if (plan.steps.length !== 2) return false
  return plan.steps[0]?.intent.kind === 'account-health'
    && ['renewal-prep', 'expansion-signal', 'deal-risk', 'account-brief'].includes(plan.steps[1]?.intent.kind || '')
    && Boolean(plan.entity)
}

export async function executeLinkedLeadMotionPlan(args: {
  cwd: string
  session: OpenGtmInteractiveSession
  plan: OpenGtmSessionPlan
}) {
  const config = await loadOpenGtmConfig(args.cwd)
  if (!config) {
    throw new Error('No workspace config found. Run "opengtm init" before interactive GTM orchestration.')
  }

  const daemon = createLocalDaemon({
    rootDir: path.join(args.cwd, config.runtimeDir || DEFAULT_RUNTIME_DIR)
  })
  const planRunId = randomUUID()
  const entity = args.plan.entity || 'Vertical Lead'
  const bootstrap = await bootstrapLiveCrmLeadContext({
    daemon,
    workflowId: 'session.supervisor.linked-lead-motion',
    workflowRunId: `${planRunId}-bootstrap`,
    workspaceId: config.workspaceId,
    initiativeId: config.initiativeId,
    leadName: entity,
    sourceTag: 'opengtm:session-supervisor'
  })

  const research = await handleResearchRun({
    daemon,
    cwd: args.cwd,
    goal: `Research CRM lead ${bootstrap.lead.name} (${bootstrap.lead.email}) for outreach readiness`,
    workspaceId: config.workspaceId,
    initiativeId: config.initiativeId,
    workflowId: 'sdr.lead_research',
    workflowRunId: `${planRunId}-research`,
    persona: 'SDR',
    fixtureSetId: 'sdr-lead-research',
    sourceIds: [bootstrap.checkpointArtifactId],
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
  const leadEvidence = collectCanonicalRuntimeEvidence({
    dbFile: bootstrap.crmDbFile,
    leadId: bootstrap.lead.id,
    accountId: bootstrap.account.id
  })
  const leadDossier = persistLeadDossier({
    storage: daemon.storage,
    workspaceId: config.workspaceId,
    initiativeId: config.initiativeId,
    leadName: bootstrap.lead.name,
    leadEmail: bootstrap.lead.email,
    crmLeadId: bootstrap.lead.id,
    checkpoint: bootstrap.checkpoint,
    sourceArtifactIds: uniqueArtifactIds([
      bootstrap.checkpointArtifactId,
      research.artifactId,
      research.memoryId
    ]),
    motion: 'lead_research',
    account: {
      crmAccountId: bootstrap.account.id,
      name: bootstrap.account.name,
      domain: bootstrap.account.domain,
      stage: bootstrap.account.stage
    },
    evidence: {
      leadActivitySubjects: leadEvidence.activities.lead.map((activity) => activity.subject),
      leadActivityTypes: leadEvidence.activities.lead.map((activity) => activity.type),
      accountActivitySubjects: leadEvidence.activities.account.map((activity) => activity.subject),
      accountActivityTypes: leadEvidence.activities.account.map((activity) => activity.type)
    }
  })

  const postResearchCheckpoint = createCheckpoint(daemon.storage, {
    id: `${planRunId}-post-research`
  })
  const checkpointArtifact = createArtifactRecord({
    workspaceId: config.workspaceId,
    initiativeId: config.initiativeId,
    kind: 'decision-log',
    lane: 'ops-automate',
    title: `Session supervisor checkpoint: ${bootstrap.lead.name}`,
    provenance: [
      'opengtm:session-supervisor',
      'support-tier:live'
    ],
    sourceIds: [bootstrap.checkpointArtifactId, research.artifactId].filter(Boolean) as string[]
  })
  const checkpointArtifactPath = writeArtifactBlob(daemon.storage, {
    workspaceSlug: 'global',
    artifactId: checkpointArtifact.id,
    content: {
      planObjective: args.plan.objective,
      lead: bootstrap.lead,
      crmDbFile: bootstrap.crmDbFile,
      bootstrapCheckpoint: bootstrap.checkpoint,
      postResearchCheckpoint,
      researchTraceId: research.traceId,
      researchArtifactId: leadDossier.artifactId,
      researchMemoryId: leadDossier.memoryId,
      leadDossierArtifactId: leadDossier.artifactId,
      lineage: {
        sourceArtifactIds: [bootstrap.checkpointArtifactId, leadDossier.artifactId].filter(Boolean)
      }
    }
  })
  upsertRecord(daemon.storage, 'artifacts', {
    ...checkpointArtifact,
    contentRef: checkpointArtifactPath,
    traceRef: research.traceId || null,
    sourceIds: [bootstrap.checkpointArtifactId, research.artifactId].filter(Boolean) as string[]
  } as any)

  const ops = await handleOpsRun({
    daemon,
    cwd: args.cwd,
    goal: `Compose first-touch outreach for ${bootstrap.lead.name}`,
    workspaceId: config.workspaceId,
    initiativeId: config.initiativeId,
    workflowId: 'sdr.outreach_compose',
    workflowRunId: `${planRunId}-outreach`,
    persona: 'SDR',
    fixtureSetId: 'sdr-outreach-compose',
    requiresApproval: true,
    sourceIds: [bootstrap.checkpointArtifactId, research.artifactId, checkpointArtifact.id].filter(Boolean) as string[],
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-lead:${bootstrap.lead.id}`,
      `crm-account:${bootstrap.account.id}`,
      `checkpoint:${postResearchCheckpoint.id}`,
      `checkpoint-at:${postResearchCheckpoint.createdAt}`
    ],
    supportTier: 'live'
  })

  const planArtifact = createArtifactRecord({
    workspaceId: config.workspaceId,
    initiativeId: config.initiativeId,
    kind: 'decision-log',
    lane: 'ops-automate',
    title: `Session plan run: ${args.plan.objective}`,
    provenance: ['opengtm:session-supervisor', 'support-tier:live']
  })
  const planArtifactPath = writeArtifactBlob(daemon.storage, {
    workspaceSlug: 'global',
    artifactId: planArtifact.id,
    content: {
      planObjective: args.plan.objective,
      lead: bootstrap.lead,
      stepResults: {
        researchTraceId: research.traceId,
        researchArtifactId: leadDossier.artifactId,
        researchMemoryId: leadDossier.memoryId,
        outreachTraceId: ops.traceId,
        approvalRequestId: ops.approvalRequestId
      },
      lineage: {
        bootstrapCheckpointArtifactId: bootstrap.checkpointArtifactId,
        postResearchCheckpointArtifactId: checkpointArtifact.id,
        sourceArtifactIds: [bootstrap.checkpointArtifactId, leadDossier.artifactId, checkpointArtifact.id].filter(Boolean)
      }
    }
  })
  upsertRecord(daemon.storage, 'artifacts', {
    ...planArtifact,
    contentRef: planArtifactPath,
    traceRef: ops.traceId || null,
    sourceIds: [bootstrap.checkpointArtifactId, research.artifactId, checkpointArtifact.id].filter(Boolean) as string[]
  } as any)

  return {
    planRunId,
    lead: bootstrap.lead,
    crmDbFile: bootstrap.crmDbFile,
    bootstrapCheckpointArtifactId: bootstrap.checkpointArtifactId,
    leadDossierArtifactId: leadDossier.artifactId,
    postResearchCheckpointArtifactId: checkpointArtifact.id,
    research: {
      ...research,
      artifactId: leadDossier.artifactId,
      artifactPath: leadDossier.artifactPath,
      memoryId: leadDossier.memoryId
    },
    ops,
    planArtifactId: planArtifact.id,
    planArtifactPath,
    lineageUpdate: {
      lead: {
        kind: 'lead' as const,
        entityName: bootstrap.lead.name,
        crmDbFile: bootstrap.crmDbFile,
        lead: { ...bootstrap.lead },
        account: { ...bootstrap.account },
        checkpoint: { ...postResearchCheckpoint },
        checkpointArtifactId: checkpointArtifact.id,
        sourceArtifactIds: uniqueArtifactIds([
          bootstrap.checkpointArtifactId,
          leadDossier.artifactId,
          leadDossier.memoryId,
          checkpointArtifact.id,
          ops.artifactId
        ]),
        lastArtifactId: ops.artifactId || leadDossier.artifactId || null,
        lastMemoryId: leadDossier.memoryId || null
      }
    }
  }
}

export async function executeLinkedAccountMotionPlan(args: {
  cwd: string
  session: OpenGtmInteractiveSession
  plan: OpenGtmSessionPlan
}) {
  const config = await loadOpenGtmConfig(args.cwd)
  if (!config) {
    throw new Error('No workspace config found. Run "opengtm init" before interactive GTM orchestration.')
  }

  const daemon = createLocalDaemon({
    rootDir: path.join(args.cwd, config.runtimeDir || DEFAULT_RUNTIME_DIR)
  })
  const planRunId = randomUUID()
  const accountName = args.plan.entity || 'Vertical Account'
  const followupIntent = args.plan.steps[1]?.intent.kind
  const bootstrap = followupIntent === 'deal-risk'
    ? await bootstrapLiveCrmDealContext({
        daemon,
        workflowId: 'session.supervisor.linked-account-motion',
        workflowRunId: `${planRunId}-bootstrap`,
        workspaceId: config.workspaceId,
        initiativeId: config.initiativeId,
        accountName,
        opportunityName: `${accountName} Renewal`,
        sourceTag: 'opengtm:session-supervisor'
      })
    : await bootstrapLiveCrmAccountContext({
        daemon,
        workflowId: 'session.supervisor.linked-account-motion',
        workflowRunId: `${planRunId}-bootstrap`,
        workspaceId: config.workspaceId,
        initiativeId: config.initiativeId,
        accountName,
        sourceTag: 'opengtm:session-supervisor'
      })

  const health = await handleResearchRun({
    daemon,
    cwd: args.cwd,
    goal: `Compute account health for ${bootstrap.account.name}`,
    workspaceId: config.workspaceId,
    initiativeId: config.initiativeId,
    workflowId: 'cs.health_score',
    workflowRunId: `${planRunId}-health`,
    persona: 'CS',
    fixtureSetId: 'cs-health-score',
    sourceIds: [bootstrap.checkpointArtifactId],
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-account:${bootstrap.account.id}`,
      `checkpoint:${bootstrap.checkpoint.id}`,
      `checkpoint-at:${bootstrap.checkpoint.createdAt}`
    ],
    supportTier: 'live',
    checkpointId: bootstrap.checkpoint.id
  })

  const healthDossier = persistAccountDossier({
    storage: daemon.storage,
    workspaceId: config.workspaceId,
    initiativeId: config.initiativeId,
    accountName: bootstrap.account.name,
    accountDomain: bootstrap.account.domain,
    crmAccountId: bootstrap.account.id,
    checkpoint: bootstrap.checkpoint,
    sourceArtifactIds: [bootstrap.checkpointArtifactId, health.artifactId].filter(Boolean) as string[],
    motion: 'health_score',
    evidence: {
      accountActivityCount: collectCanonicalRuntimeEvidence({
        dbFile: bootstrap.crmDbFile,
        accountId: bootstrap.account.id
      }).activities.account.length,
      opportunityCount: listCanonicalOpportunities(bootstrap.crmDbFile).filter((item) => item.accountId === bootstrap.account.id).length
    }
  })
  const dealBootstrap = (followupIntent === 'deal-risk' && 'opportunity' in bootstrap)
    ? bootstrap as Awaited<ReturnType<typeof bootstrapLiveCrmDealContext>>
    : null
  const linkedOpportunityId = dealBootstrap
    ? dealBootstrap.opportunity.id
    : `${bootstrap.account.id}-deal`
  const linkedOpportunityName = dealBootstrap
    ? dealBootstrap.opportunity.name
    : `${bootstrap.account.name} Renewal`
  const linkedOpportunityAmount = dealBootstrap
    ? dealBootstrap.opportunity.amountCents
    : 1250000

  const postHealthCheckpoint = createCheckpoint(daemon.storage, {
    id: `${planRunId}-post-health`
  })
  const checkpointArtifact = createArtifactRecord({
    workspaceId: config.workspaceId,
    initiativeId: config.initiativeId,
    kind: 'decision-log',
    lane: 'research',
    title: `Session supervisor account checkpoint: ${bootstrap.account.name}`,
    provenance: ['opengtm:session-supervisor', 'support-tier:live'],
    sourceIds: [bootstrap.checkpointArtifactId, healthDossier.artifactId].filter(Boolean) as string[]
  })
  const checkpointArtifactPath = writeArtifactBlob(daemon.storage, {
    workspaceSlug: 'global',
    artifactId: checkpointArtifact.id,
    content: {
      planObjective: args.plan.objective,
      account: bootstrap.account,
      crmDbFile: bootstrap.crmDbFile,
      bootstrapCheckpoint: bootstrap.checkpoint,
      postHealthCheckpoint,
      healthTraceId: health.traceId,
      healthArtifactId: health.artifactId,
      healthDossierArtifactId: healthDossier.artifactId
    }
  })
  upsertRecord(daemon.storage, 'artifacts', {
    ...checkpointArtifact,
    contentRef: checkpointArtifactPath,
    traceRef: health.traceId || null,
    sourceIds: [bootstrap.checkpointArtifactId, healthDossier.artifactId].filter(Boolean) as string[]
  } as any)

  const followupGoal = followupIntent === 'renewal-prep'
    ? `Prepare renewal brief for ${bootstrap.account.name}`
    : followupIntent === 'deal-risk'
      ? `Scan deal risk for ${bootstrap.account.name} Renewal`
      : followupIntent === 'account-brief'
        ? `Generate account brief for ${bootstrap.account.name}`
        : `Find expansion signals for ${bootstrap.account.name}`
  const followupWorkflowId = followupIntent === 'renewal-prep'
    ? 'cs.renewal_prep'
    : followupIntent === 'deal-risk'
      ? 'ae.deal_risk_scan'
      : followupIntent === 'account-brief'
        ? 'ae.account_brief'
        : 'ae.expansion_signal'
  const followupPersona = followupIntent === 'renewal-prep' ? 'CS' : 'AE'
  const followupFixtureSet = followupIntent === 'renewal-prep'
    ? 'cs-renewal-prep'
    : followupIntent === 'deal-risk'
      ? 'ae-deal-risk-scan'
      : followupIntent === 'account-brief'
        ? 'ae-account-brief'
        : 'ae-expansion-signal'

  const followup = await handleResearchRun({
    daemon,
    cwd: args.cwd,
    goal: followupGoal,
    workspaceId: config.workspaceId,
    initiativeId: config.initiativeId,
    workflowId: followupWorkflowId,
    workflowRunId: `${planRunId}-followup`,
    persona: followupPersona,
    fixtureSetId: followupFixtureSet,
    sourceIds: [bootstrap.checkpointArtifactId, healthDossier.artifactId, checkpointArtifact.id].filter(Boolean) as string[],
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-account:${bootstrap.account.id}`,
      ...(followupIntent === 'deal-risk' ? [`crm-opportunity:${linkedOpportunityId}`] : []),
      `checkpoint:${postHealthCheckpoint.id}`,
      `checkpoint-at:${postHealthCheckpoint.createdAt}`
    ],
    supportTier: 'live',
    checkpointId: postHealthCheckpoint.id
  })

  const followupDossier = followupIntent === 'deal-risk'
    ? persistDealDossier({
        storage: daemon.storage,
        workspaceId: config.workspaceId,
        initiativeId: config.initiativeId,
        accountName: bootstrap.account.name,
        accountDomain: bootstrap.account.domain,
        crmAccountId: bootstrap.account.id,
        opportunityName: linkedOpportunityName,
        crmOpportunityId: linkedOpportunityId,
        amountCents: linkedOpportunityAmount,
        checkpoint: postHealthCheckpoint,
        sourceArtifactIds: [bootstrap.checkpointArtifactId, healthDossier.artifactId, followup.artifactId, checkpointArtifact.id].filter(Boolean) as string[],
        motion: 'deal_risk_scan',
        evidence: {
          accountActivityCount: collectCanonicalRuntimeEvidence({
            dbFile: bootstrap.crmDbFile,
            accountId: bootstrap.account.id
          }).activities.account.length,
          opportunityActivityCount: collectCanonicalRuntimeEvidence({
            dbFile: bootstrap.crmDbFile,
            opportunityId: linkedOpportunityId
          }).activities.opportunity.length
        }
      })
    : persistAccountDossier({
        storage: daemon.storage,
        workspaceId: config.workspaceId,
        initiativeId: config.initiativeId,
        accountName: bootstrap.account.name,
        accountDomain: bootstrap.account.domain,
        crmAccountId: bootstrap.account.id,
        checkpoint: postHealthCheckpoint,
        sourceArtifactIds: [bootstrap.checkpointArtifactId, healthDossier.artifactId, followup.artifactId, checkpointArtifact.id].filter(Boolean) as string[],
        motion: followupIntent || 'account_followup',
        evidence: {
          accountActivityCount: collectCanonicalRuntimeEvidence({
            dbFile: bootstrap.crmDbFile,
            accountId: bootstrap.account.id
          }).activities.account.length,
          opportunityCount: listCanonicalOpportunities(bootstrap.crmDbFile).filter((item) => item.accountId === bootstrap.account.id).length
        }
      })

  const planArtifact = createArtifactRecord({
    workspaceId: config.workspaceId,
    initiativeId: config.initiativeId,
    kind: 'decision-log',
    lane: 'research',
    title: `Session account plan run: ${args.plan.objective}`,
    provenance: ['opengtm:session-supervisor', 'support-tier:live']
  })
  const planArtifactPath = writeArtifactBlob(daemon.storage, {
    workspaceSlug: 'global',
    artifactId: planArtifact.id,
    content: {
      planObjective: args.plan.objective,
      account: bootstrap.account,
      stepResults: {
        healthTraceId: health.traceId,
        healthDossierArtifactId: healthDossier.artifactId,
        followupTraceId: followup.traceId,
        followupDossierArtifactId: followupDossier.artifactId
      },
      lineage: {
        bootstrapCheckpointArtifactId: bootstrap.checkpointArtifactId,
        postHealthCheckpointArtifactId: checkpointArtifact.id,
        sourceArtifactIds: [bootstrap.checkpointArtifactId, healthDossier.artifactId, checkpointArtifact.id, followupDossier.artifactId].filter(Boolean)
      }
    }
  })
  upsertRecord(daemon.storage, 'artifacts', {
    ...planArtifact,
    contentRef: planArtifactPath,
    traceRef: followup.traceId || null,
    sourceIds: [bootstrap.checkpointArtifactId, healthDossier.artifactId, checkpointArtifact.id, followupDossier.artifactId].filter(Boolean) as string[]
  } as any)

  return {
    planRunId,
    account: bootstrap.account,
    crmDbFile: bootstrap.crmDbFile,
    bootstrapCheckpointArtifactId: bootstrap.checkpointArtifactId,
    postHealthCheckpointArtifactId: checkpointArtifact.id,
    health,
    healthDossier,
    followup,
    followupDossier,
    planArtifactId: planArtifact.id,
    planArtifactPath,
    lineageUpdate: {
      account: {
        kind: 'account' as const,
        entityName: bootstrap.account.name,
        crmDbFile: bootstrap.crmDbFile,
        account: { ...bootstrap.account },
        checkpoint: { ...postHealthCheckpoint },
        checkpointArtifactId: checkpointArtifact.id,
        sourceArtifactIds: uniqueArtifactIds([
          bootstrap.checkpointArtifactId,
          health.artifactId,
          healthDossier.artifactId,
          healthDossier.memoryId,
          checkpointArtifact.id,
          followup.artifactId,
          followupDossier.artifactId,
          followupDossier.memoryId
        ]),
        dossierArtifactId: followupIntent === 'deal-risk' ? healthDossier.artifactId : followupDossier.artifactId,
        dossierMemoryId: followupIntent === 'deal-risk' ? healthDossier.memoryId : followupDossier.memoryId
      },
      deal: followupIntent === 'deal-risk'
        ? {
            kind: 'deal' as const,
            entityName: linkedOpportunityName,
            crmDbFile: bootstrap.crmDbFile,
            account: { ...bootstrap.account },
            opportunity: {
              id: linkedOpportunityId,
              accountId: bootstrap.account.id,
              name: linkedOpportunityName,
              amountCents: linkedOpportunityAmount,
              stage: dealBootstrap?.opportunity.stage || 'open',
              createdAt: dealBootstrap?.opportunity.createdAt || postHealthCheckpoint.createdAt
            },
            checkpoint: { ...postHealthCheckpoint },
            checkpointArtifactId: checkpointArtifact.id,
            sourceArtifactIds: uniqueArtifactIds([
              bootstrap.checkpointArtifactId,
              health.artifactId,
              healthDossier.artifactId,
              healthDossier.memoryId,
              checkpointArtifact.id,
              followup.artifactId,
              followupDossier.artifactId,
              followupDossier.memoryId
            ]),
            dossierArtifactId: followupDossier.artifactId,
            dossierMemoryId: followupDossier.memoryId
          }
        : undefined
    }
  }
}
