import type { OpenGtmLocalDaemon } from '@opengtm/daemon'

export async function handleApprovals(args: {
  daemon: OpenGtmLocalDaemon
  action?: 'list' | 'approve' | 'deny'
  id?: string
}) {
  const { listRecords } = await import('@opengtm/storage')
  const storage = args.daemon.storage
  const items = listRecords(storage, 'approval_requests')

  return { approvals: items }
}