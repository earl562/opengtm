import type { OpenGtmLocalDaemon } from '@opengtm/daemon'

export async function handleMemory(args: { daemon: OpenGtmLocalDaemon }) {
  const { listRecords } = await import('@opengtm/storage')
  const memory = listRecords(args.daemon.storage as any, 'memory_records')
  return { memory }
}
