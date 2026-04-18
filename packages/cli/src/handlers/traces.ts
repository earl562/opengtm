import type { OpenGtmLocalDaemon } from '@opengtm/daemon'

export async function handleTraces(args: { daemon: OpenGtmLocalDaemon }) {
  const { listRecords } = await import('@opengtm/storage')
  const traces = listRecords(args.daemon.storage as any, 'run_traces')
  return { traces }
}
