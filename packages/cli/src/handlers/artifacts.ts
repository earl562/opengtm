import type { OpenGtmLocalDaemon } from '@opengtm/daemon'

export async function handleArtifacts(args: { daemon: OpenGtmLocalDaemon }) {
  const { listRecords } = await import('@opengtm/storage')
  const artifacts = listRecords(args.daemon.storage as any, 'artifacts')
  return { artifacts }
}
