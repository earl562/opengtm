import type { OpenGtmWorkspace, OpenGtmInitiative, OpenGtmWorkItem, OpenGtmWorkspaceInput, OpenGtmInitiativeInput, OpenGtmWorkItemInput, OpenGtmAgentJob, OpenGtmAgentJobInput, OpenGtmAgentJobUpdateInput } from '@opengtm/types'
import { createWorkspace, createInitiative, createWorkItem, createAgentJob, updateAgentJob } from '@opengtm/core'
import { createStorage, upsertRecord, listRecords, getRecord } from '@opengtm/storage'

export interface OpenGtmLocalDaemon {
  storage: ReturnType<typeof createStorage>
  workspace: OpenGtmWorkspace | null
  initiative: OpenGtmInitiative | null
  createWorkspace: (payload: OpenGtmWorkspaceInput) => OpenGtmWorkspace
  listWorkspaces: () => OpenGtmWorkspace[]
  createInitiative: (payload: OpenGtmInitiativeInput) => OpenGtmInitiative
  listInitiatives: (opts: { workspaceId?: string }) => OpenGtmInitiative[]
  createWorkItem: (payload: OpenGtmWorkItemInput) => OpenGtmWorkItem
  listWorkItems: (opts: { initiativeId?: string }) => OpenGtmWorkItem[]
  createAgentJob: (payload: OpenGtmAgentJobInput) => OpenGtmAgentJob
  listAgentJobs: (opts: { workspaceId?: string; initiativeId?: string; status?: string }) => OpenGtmAgentJob[]
  updateAgentJob: (id: string, updates: OpenGtmAgentJobUpdateInput) => OpenGtmAgentJob
}

export function createLocalDaemon({ rootDir }: { rootDir: string }): OpenGtmLocalDaemon {
  const storage = createStorage({ rootDir })

  return {
    storage,
    workspace: null,
    initiative: null,
    createWorkspace: (payload: OpenGtmWorkspaceInput) => {
      const ws = createWorkspace(payload)
      upsertRecord(storage, 'workspaces', ws)
      return ws
    },
    listWorkspaces: () => {
      return listRecords(storage, 'workspaces', {}) as OpenGtmWorkspace[]
    },
    createInitiative: (payload: OpenGtmInitiativeInput) => {
      const init = createInitiative(payload)
      upsertRecord(storage, 'initiatives', init)
      return init
    },
    listInitiatives: ({ workspaceId }: { workspaceId?: string }) => {
      return listRecords(storage, 'initiatives', { workspaceId }) as OpenGtmInitiative[]
    },
    createWorkItem: (payload: OpenGtmWorkItemInput) => {
      const item = createWorkItem(payload)
      upsertRecord(storage, 'work_items', item)
      return item
    },
    listWorkItems: ({ initiativeId }: { initiativeId?: string }) => {
      return listRecords(storage, 'work_items', { workspaceId: initiativeId }) as OpenGtmWorkItem[]
    },
    createAgentJob: (payload: OpenGtmAgentJobInput) => {
      const job = createAgentJob(payload)
      upsertRecord(storage, 'agent_jobs', job)
      return job
    },
    listAgentJobs: ({ workspaceId, initiativeId, status }: { workspaceId?: string; initiativeId?: string; status?: string }) => {
      return (listRecords(storage, 'agent_jobs', { workspaceId }) as OpenGtmAgentJob[])
        .filter((job) => !initiativeId || job.initiativeId === initiativeId)
        .filter((job) => !status || job.status === status)
    },
    updateAgentJob: (id: string, updates: OpenGtmAgentJobUpdateInput) => {
      const existing = getRecord<OpenGtmAgentJob>(storage, 'agent_jobs', id)
      if (!existing) {
        throw new Error(`Unknown agent job: ${id}`)
      }
      const updated = updateAgentJob(existing, updates)
      upsertRecord(storage, 'agent_jobs', updated)
      return updated
    }
  }
}
