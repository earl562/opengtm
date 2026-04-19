import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { getDaemonStatusView } from '@opengtm/daemon'

export async function handleDaemonStatus(args: {
  daemon: OpenGtmLocalDaemon
}) {
  const { listRecords } = await import('@opengtm/storage')
  const storage = args.daemon.storage

  return getDaemonStatusView({
    workspaceName: args.daemon.workspace?.name || null,
    initiativeTitle: args.daemon.initiative?.title || null,
    workItems: listRecords(storage, 'work_items'),
    traces: listRecords(storage, 'run_traces'),
    approvals: listRecords(storage, 'approval_requests'),
    feedback: listRecords(storage, 'feedback_records'),
    artifacts: listRecords(storage, 'artifacts'),
    memory: listRecords(storage, 'memory_records')
  })
}
