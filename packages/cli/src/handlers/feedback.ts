import { createFeedbackRecord, updateRunTrace } from '@opengtm/core'
import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import type { OpenGtmFeedbackAction, OpenGtmFeedbackRecord, OpenGtmRunTrace } from '@opengtm/types'

export async function handleFeedback(args: {
  daemon: OpenGtmLocalDaemon
  action?: 'list' | 'record'
  feedbackAction?: OpenGtmFeedbackAction
  traceId?: string
  message?: string
  actor?: string
  artifactId?: string
  approvalRequestId?: string
  workflowId?: string
  persona?: string
}) {
  const { getRecord, listRecords, upsertRecord } = await import('@opengtm/storage')

  if (!args.action || args.action === 'list') {
    const items = listRecords<OpenGtmFeedbackRecord>(args.daemon.storage, 'feedback_records')
    return {
      feedback: items,
      summary: {
        total: items.length,
        byAction: items.reduce<Record<string, number>>((summary, item) => {
          summary[item.action] = (summary[item.action] || 0) + 1
          return summary
        }, {})
      }
    }
  }

  if (!args.feedbackAction || !args.traceId) {
    throw new Error('Feedback record requires an action and trace id.')
  }

  const trace = getRecord<OpenGtmRunTrace>(args.daemon.storage, 'run_traces', args.traceId)
  if (!trace) {
    throw new Error(`Trace not found for feedback: ${args.traceId}`)
  }
  const workItem = getRecord<{ workspaceId?: string }>(args.daemon.storage, 'work_items', trace.workItemId)
  if (!workItem?.workspaceId) {
    throw new Error(`Linked work item missing for feedback trace: ${trace.workItemId}`)
  }

  const feedback = createFeedbackRecord({
    workspaceId: workItem.workspaceId,
    traceId: trace.id,
    approvalRequestId: args.approvalRequestId || null,
    artifactId: args.artifactId || null,
    workflowId: args.workflowId || trace.workflowId || null,
    persona: args.persona || trace.persona || null,
    action: args.feedbackAction,
    actor: args.actor || 'operator',
    message: args.message || `${args.feedbackAction} recorded for trace ${trace.id}`
  })

  const updatedTrace = updateRunTrace(trace, {
    feedbackEventIds: [...trace.feedbackEventIds, feedback.id]
  })

  upsertRecord(args.daemon.storage, 'feedback_records', feedback)
  upsertRecord(args.daemon.storage, 'run_traces', updatedTrace)

  return {
    feedback,
    trace: {
      id: updatedTrace.id,
      status: updatedTrace.status
    },
    summary: {
      nextAction: 'Feedback recorded and linked to the trace.'
    }
  }
}
