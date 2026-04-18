import { createEntityBase } from './utils.js'
import type { OpenGtmAnalyticsSnapshot, OpenGtmAnalyticsSnapshotInput } from '@opengtm/types'

export function createAnalyticsSnapshot(input: OpenGtmAnalyticsSnapshotInput): OpenGtmAnalyticsSnapshot {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    initiativeId: input.initiativeId,
    workItemCount: input.workItemCount || 0,
    completedWorkItemCount: input.completedWorkItemCount || 0,
    failedWorkItemCount: input.failedWorkItemCount || 0,
    averageCycleTimeHours: input.averageCycleTimeHours || 0
  }
}