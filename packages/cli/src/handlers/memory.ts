import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import type { OpenGtmMemoryRecord } from '@opengtm/types'

export async function handleMemory(args: { daemon: OpenGtmLocalDaemon }) {
  const { listRecords } = await import('@opengtm/storage')
  const memory = listRecords<OpenGtmMemoryRecord>(args.daemon.storage, 'memory_records')
  return {
    memory,
    summary: {
      total: memory.length,
      working: memory.filter((record) => record.memoryType === 'working').length,
      episodic: memory.filter((record) => record.memoryType === 'episodic').length,
      semantic: memory.filter((record) => record.memoryType === 'semantic').length
    }
  }
}
