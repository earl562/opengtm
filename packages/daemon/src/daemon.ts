import type { OpenGtmWorkspace, OpenGtmInitiative, OpenGtmWorkItem, OpenGtmWorkspaceInput, OpenGtmInitiativeInput, OpenGtmWorkItemInput } from '@opengtm/types'
import { createWorkspace, createInitiative, createWorkItem } from '@opengtm/core'
import { createStorage, upsertRecord, listRecords } from '@opengtm/storage'

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
    }
  }
}