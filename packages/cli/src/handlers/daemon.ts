import type { OpenGtmLocalDaemon } from '@opengtm/daemon'

export async function handleDaemonStatus(args: {
  daemon: OpenGtmLocalDaemon
}) {
  return {
    status: 'running',
    workspace: args.daemon.workspace?.name || null,
    initiative: args.daemon.initiative?.title || null
  }
}