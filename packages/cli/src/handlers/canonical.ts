import { createArtifactRecord } from '@opengtm/core'
import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { createCheckpoint, upsertRecord, writeArtifactBlob } from '@opengtm/storage'
import { createCanonicalLead, resolveCanonicalCrmDbFile } from '../canonical-crm.js'
import { OPEN_GTM_CANONICAL_SCENARIO_ID, OPEN_GTM_CANONICAL_SCENARIO_LABEL } from '../truthfulness.js'
import { handleOpsRun } from './ops.js'
import { handleResearchRun } from './research.js'

export async function handleCanonicalCrmRoundtripRun(args: {
  daemon: OpenGtmLocalDaemon
  goal?: string
  workspaceId?: string
  initiativeId?: string
  workflowId: string
  workflowRunId: string
  persona: string
  fixtureSetId: string
}) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const crmDbFile = resolveCanonicalCrmDbFile(args.daemon.storage.rootDir)
  const leadName = args.goal?.trim() ? args.goal.trim() : 'Canonical CRM Lead'
  const leadEmail = `${leadName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'canonical' }@example.com`
  const lead = createCanonicalLead(crmDbFile, {
    name: leadName,
    email: leadEmail
  })

  const research = await handleResearchRun({
    daemon: args.daemon,
    goal: `Research lead ${lead.name} (${lead.email}) from CRM event lead.created`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId
  })

  const checkpoint = createCheckpoint(args.daemon.storage, {
    id: `${args.workflowRunId}-post-research`
  })
  const checkpointArtifact = createArtifactRecord({
    workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    kind: 'decision-log',
    lane: 'ops-automate',
    title: `Canonical checkpoint: ${lead.name}`,
    provenance: [
      'opengtm:canonical-crm-roundtrip',
      `canonical-scenario:${OPEN_GTM_CANONICAL_SCENARIO_ID}`,
      'support-tier:live'
    ]
  })
  const checkpointArtifactPath = writeArtifactBlob(args.daemon.storage, {
    workspaceSlug: 'global',
    artifactId: checkpointArtifact.id,
    content: {
      canonicalScenarioId: OPEN_GTM_CANONICAL_SCENARIO_ID,
      canonicalScenarioLabel: OPEN_GTM_CANONICAL_SCENARIO_LABEL,
      checkpoint,
      lead,
      researchTraceId: research.traceId,
      researchArtifactId: research.artifactId,
      recoverySemantics: {
        researchArtifact: 'reversible',
        approvalDraft: 'resumable',
        crmActivityAfterDecision: 'operator-intervention-required'
      }
    }
  })
  upsertRecord(args.daemon.storage, 'artifacts', {
    ...checkpointArtifact,
    contentRef: checkpointArtifactPath,
    traceRef: research.traceId || null,
    sourceIds: [research.artifactId].filter(Boolean)
  } as any)

  const ops = await handleOpsRun({
    daemon: args.daemon,
    goal: `Draft outreach for ${lead.name}`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    requiresApproval: true,
    sourceIds: [research.artifactId, checkpointArtifact.id].filter(Boolean) as string[],
    connectorTargets: [
      `crm-db:${crmDbFile}`,
      `crm-lead:${lead.id}`,
      `checkpoint:${checkpoint.id}`
    ],
    supportTier: 'live',
    canonicalScenarioId: OPEN_GTM_CANONICAL_SCENARIO_ID
  })

  return {
    ...ops,
    supportTier: 'live' as const,
    isCanonical: true,
    canonicalScenarioId: OPEN_GTM_CANONICAL_SCENARIO_ID,
    researchTraceId: research.traceId,
    researchArtifactId: research.artifactId,
    checkpointArtifactId: checkpointArtifact.id,
    crmLeadId: lead.id,
    crmDbFile,
    nextAction: 'Approve or deny the canonical CRM roundtrip outreach draft, then inspect CRM activity, traces, and feedback lineage.'
  }
}
