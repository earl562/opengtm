import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { bootstrapLiveCrmLeadContext } from '../live-crm.js'
import { handleOpsRun } from './ops.js'
import { handleResearchRun } from './research.js'

export async function handleLiveLeadResearchWorkflow(args: {
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

  const leadName = args.goal?.trim() || 'Live Research Lead'
  const bootstrap = await bootstrapLiveCrmLeadContext({
    daemon: args.daemon,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    workspaceId,
    initiativeId: args.initiativeId,
    leadName,
    sourceTag: 'opengtm:live-lead-research'
  })

  return handleResearchRun({
    daemon: args.daemon,
    goal: `Research CRM lead ${bootstrap.lead.name} (${bootstrap.lead.email}) for outreach readiness`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    sourceIds: [bootstrap.checkpointArtifactId],
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-lead:${bootstrap.lead.id}`,
      `checkpoint:${bootstrap.checkpoint.id}`
    ],
    supportTier: 'live',
    checkpointId: bootstrap.checkpoint.id
  })
}

export async function handleLiveOutreachComposeWorkflow(args: {
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

  const leadName = args.goal?.trim() || 'Live Outreach Lead'
  const bootstrap = await bootstrapLiveCrmLeadContext({
    daemon: args.daemon,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    workspaceId,
    initiativeId: args.initiativeId,
    leadName,
    sourceTag: 'opengtm:live-outreach-compose'
  })

  return handleOpsRun({
    daemon: args.daemon,
    goal: `Compose first-touch outreach for ${bootstrap.lead.name}`,
    workspaceId,
    initiativeId: args.initiativeId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    persona: args.persona,
    fixtureSetId: args.fixtureSetId,
    requiresApproval: true,
    sourceIds: [bootstrap.checkpointArtifactId],
    connectorTargets: [
      `crm-db:${bootstrap.crmDbFile}`,
      `crm-lead:${bootstrap.lead.id}`,
      `checkpoint:${bootstrap.checkpoint.id}`
    ],
    supportTier: 'live'
  })
}
