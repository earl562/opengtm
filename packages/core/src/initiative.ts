import { createEntityBase } from './utils.js'
import type { OpenGtmInitiative, OpenGtmInitiativeInput, OpenGtmInitiativeSummary } from '@opengtm/types'

export function createInitiative(input: OpenGtmInitiativeInput): OpenGtmInitiative {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    title: input.title,
    summary: input.summary || '',
    status: input.status || 'active',
    owners: input.owners || [],
    sourceIds: input.sourceIds || [],
    accountIds: input.accountIds || [],
    artifactIds: input.artifactIds || [],
    workflowIds: input.workflowIds || [],
    journeyIds: input.journeyIds || [],
    health: (input.health as OpenGtmInitiative['health']) || 'healthy',
    activeInitiativeId: input.activeInitiativeId || null
  }
}

export function createInitiativeSummary(initiative: OpenGtmInitiative, stats: {
  ownerCount: number
  activeRunCount: number
  completedWorkItemCount: number
  pendingApprovalCount: number
}): OpenGtmInitiativeSummary {
  return {
    id: initiative.id,
    workspaceId: initiative.workspaceId,
    title: initiative.title,
    summary: initiative.summary,
    status: initiative.status,
    health: initiative.health,
    ownerCount: stats.ownerCount,
    activeRunCount: stats.activeRunCount,
    completedWorkItemCount: stats.completedWorkItemCount,
    pendingApprovalCount: stats.pendingApprovalCount
  }
}