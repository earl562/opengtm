import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { createRunTrace } from '@opengtm/core'
import { createPolicyDecisionFromActionWithConfig, createApprovalRequestForDecision, loadPolicyConfig } from '@opengtm/policy'

export async function handleBuildRun(args: {
  daemon: OpenGtmLocalDaemon
  goal: string
  workspaceId?: string
  initiativeId?: string
}) {
  const workspaceId = args.workspaceId || args.daemon.workspace?.id
  if (!workspaceId) {
    throw new Error('No workspace. Run "opengtm init" first.')
  }

  const workItem = args.daemon.createWorkItem({
    workspaceId,
    initiativeId: args.initiativeId || 'unknown',
    ownerLane: 'build-integrate',
    title: `Build: ${args.goal}`,
    goal: args.goal
  })

  const policyConfig = await loadPolicyConfig({ cwd: process.cwd() })
  const decision = createPolicyDecisionFromActionWithConfig({
    workItemId: workItem.id,
    lane: 'build-integrate',
    actionType: 'write-repo',
    target: args.goal
  }, policyConfig)

  const approval = createApprovalRequestForDecision({
    workspaceId,
    decision,
    actionSummary: `Build action requires approval: ${args.goal}`
  })

  const trace = createRunTrace({
    workItemId: workItem.id,
    lane: 'build-integrate',
    status: 'awaiting-approval',
    steps: [
      { name: 'spec', status: 'completed' },
      { name: 'implement', status: 'awaiting-approval' }
    ],
    policyDecisionIds: [decision.id],
    artifactIds: []
  })

  const { upsertRecord } = await import('@opengtm/storage')
  upsertRecord(args.daemon.storage as any, 'work_items', workItem as any)
  upsertRecord(args.daemon.storage as any, 'policy_decisions', decision as any)
  upsertRecord(args.daemon.storage as any, 'approval_requests', approval as any)
  upsertRecord(args.daemon.storage as any, 'run_traces', trace as any)

  return { workItem, approvalRequestId: approval.id, traceId: trace.id }
}
