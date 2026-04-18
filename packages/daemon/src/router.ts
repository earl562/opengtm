import type { OpenGtmLocalDaemon } from './daemon.js'

export interface OpenGtmLocalApiRouter {
  handle(command: string, payload?: Record<string, unknown>): unknown
}

export function createLocalApiRouter(daemon: OpenGtmLocalDaemon): OpenGtmLocalApiRouter {
  return {
    handle(command: string, payload = {}) {
      if (command === 'daemon.status') {
        return { status: 'running' }
      }
      if (command === 'workspace.list') {
        return { workspaces: daemon.listWorkspaces() }
      }
      if (command === 'workspace.create') {
        return { workspace: daemon.createWorkspace(payload as any) }
      }
      if (command === 'initiative.list') {
        return { initiatives: daemon.listInitiatives(payload as any) }
      }
      if (command === 'initiative.create') {
        return { initiative: daemon.createInitiative(payload as any) }
      }
      throw new Error(`Unknown command: ${command}`)
    }
  }
}