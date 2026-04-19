import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import type { OpenGtmArtifactRecord } from '@opengtm/types'

export async function handleArtifacts(args: { daemon: OpenGtmLocalDaemon }) {
  const { listRecords } = await import('@opengtm/storage')
  const artifacts = listRecords<OpenGtmArtifactRecord>(args.daemon.storage, 'artifacts')
  return {
    artifacts,
    summary: {
      total: artifacts.length,
      byLane: artifacts.reduce<Record<string, number>>((summary, artifact) => {
        const lane = typeof artifact.lane === 'string' ? artifact.lane : 'unknown'
        summary[lane] = (summary[lane] || 0) + 1
        return summary
      }, {})
    }
  }
}
