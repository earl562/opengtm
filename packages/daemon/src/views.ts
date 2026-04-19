import type { OpenGtmInitiative, OpenGtmWorkItem } from '@opengtm/types'

export function getInitiativeView(initiative: OpenGtmInitiative, workItems: OpenGtmWorkItem[]) {
  return {
    initiative,
    workItems,
    activeItems: workItems.filter((item) => item.status === 'running' || item.status === 'queued'),
    completedItems: workItems.filter((item) => item.status === 'completed')
  }
}

export function summarizeByKey<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T
): Record<string, number> {
  return items.reduce<Record<string, number>>((summary, item) => {
    const value = item[key]
    const label = typeof value === 'string' && value.length > 0 ? value : 'unknown'
    summary[label] = (summary[label] || 0) + 1
    return summary
  }, {})
}

export function getDaemonStatusView(args: {
  workspaceName: string | null
  initiativeTitle: string | null
  workItems: Array<{ ownerLane?: string; status?: string }>
  traces: Array<{ lane?: string; status?: string }>
  approvals: Array<{ status?: string }>
  feedback: Array<unknown>
  artifacts: Array<unknown>
  memory: Array<unknown>
}) {
  return {
    status: 'running' as const,
    workspace: args.workspaceName,
    initiative: args.initiativeTitle,
    counts: {
      workItems: args.workItems.length,
      traces: args.traces.length,
      approvals: args.approvals.length,
      feedback: args.feedback.length,
      artifacts: args.artifacts.length,
      memory: args.memory.length
    },
    laneSummary: summarizeByKey(args.workItems, 'ownerLane'),
    traceStatusSummary: summarizeByKey(args.traces, 'status'),
    approvalStatusSummary: summarizeByKey(args.approvals, 'status')
  }
}
