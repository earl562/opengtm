import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import type { OpenGtmFeedbackRecord, OpenGtmRunTrace, OpenGtmWorkItem } from '@opengtm/types'
import type { OpenGtmAutonomyMode } from '../autonomy.js'
import { handleBuildRun } from './build.js'
import { handleOpsRun } from './ops.js'
import { handleResearchRun } from './research.js'
import { handleWorkflowRun } from './workflows.js'

export async function handleTraces(args: {
  daemon: OpenGtmLocalDaemon
  action?: 'list' | 'show' | 'replay' | 'rerun'
  id?: string
  workspaceId?: string
  initiativeId?: string
  autonomyMode?: OpenGtmAutonomyMode
}) {
  const { getRecord, listRecords } = await import('@opengtm/storage')

  if (!args.action || args.action === 'list') {
    const traces = listRecords<OpenGtmRunTrace>(args.daemon.storage, 'run_traces')
    return {
      traces,
      summary: {
        total: traces.length,
        awaitingApproval: traces.filter((trace) => trace.status === 'awaiting-approval').length,
        completed: traces.filter((trace) => trace.status === 'completed').length,
        failed: traces.filter((trace) => trace.status === 'failed').length
      }
    }
  }

  if (!args.id) {
    throw new Error(`Trace id is required for traces ${args.action}.`)
  }

  const trace = getRecord<OpenGtmRunTrace>(args.daemon.storage, 'run_traces', args.id)
  if (!trace) {
    throw new Error(`Trace not found: ${args.id}`)
  }

  const workItem = getRecord<OpenGtmWorkItem>(args.daemon.storage, 'work_items', trace.workItemId)
  const feedback = listRecords<OpenGtmFeedbackRecord>(args.daemon.storage, 'feedback_records')
    .filter((item) => item.traceId === trace.id)

  if (args.action === 'show') {
    return {
      trace,
      workItem,
      feedback,
      summary: {
        feedbackCount: feedback.length,
        nextAction: 'Inspect the trace metadata, then replay it or continue the linked workflow.'
      }
    }
  }

  if (args.action === 'replay') {
    return {
      mode: 'deterministic-replay',
      trace,
      workItem,
      feedback,
      summary: {
        feedbackCount: feedback.length,
        nextAction: 'This replay is read-only recorded state. Use traces rerun <trace-id> to re-execute the underlying workflow or lane.'
      }
    }
  }

  if (!workItem) {
    throw new Error(`Trace rerun requires a linked work item: ${trace.workItemId}`)
  }

  if (trace.workflowId) {
    return handleWorkflowRun({
      daemon: args.daemon,
      workflowId: trace.workflowId,
      goal: workItem.goal,
      workspaceId: args.workspaceId || workItem.workspaceId,
      initiativeId: args.initiativeId || workItem.initiativeId,
      autonomyMode: args.autonomyMode
    })
  }

  if (trace.lane === 'research') {
    return handleResearchRun({
      daemon: args.daemon,
      goal: workItem.goal,
      workspaceId: args.workspaceId || workItem.workspaceId,
      initiativeId: args.initiativeId || workItem.initiativeId,
      autonomyMode: args.autonomyMode,
      persona: trace.persona,
      fixtureSetId: trace.fixtureSetId
    })
  }

  if (trace.lane === 'build-integrate') {
    return handleBuildRun({
      daemon: args.daemon,
      goal: workItem.goal,
      workspaceId: args.workspaceId || workItem.workspaceId,
      initiativeId: args.initiativeId || workItem.initiativeId,
      autonomyMode: args.autonomyMode,
      persona: trace.persona,
      fixtureSetId: trace.fixtureSetId
    })
  }

  return handleOpsRun({
    daemon: args.daemon,
    goal: workItem.goal,
    workspaceId: args.workspaceId || workItem.workspaceId,
    initiativeId: args.initiativeId || workItem.initiativeId,
    autonomyMode: args.autonomyMode,
    persona: trace.persona,
    fixtureSetId: trace.fixtureSetId,
    requiresApproval: trace.status === 'awaiting-approval'
  })
}
