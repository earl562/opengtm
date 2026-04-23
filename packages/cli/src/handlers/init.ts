import { loadOpenGtmConfig, saveOpenGtmConfig, type OpenGtmConfig } from '../config.js'
import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import type { OpenGtmAutonomyMode } from '../autonomy.js'

export async function handleInit(args: {
  cwd: string
  name: string
  initiative?: string
  daemon: OpenGtmLocalDaemon
  autonomyMode?: OpenGtmAutonomyMode
}) {
  const ws = args.daemon.createWorkspace({ name: args.name })
  const init = args.daemon.createInitiative({
    workspaceId: ws.id,
    title: args.initiative || 'Default Initiative'
  })

  const config: OpenGtmConfig = {
    runtimeDir: '.opengtm/runtime',
    workspaceId: ws.id,
    initiativeId: init.id,
    workspaceName: ws.name,
    initiativeTitle: init.title,
    workspaceRoot: args.cwd,
    autonomyMode: args.autonomyMode ?? 'off'
  }

  await saveOpenGtmConfig(args.cwd, config)
  const savedConfig = await loadOpenGtmConfig(args.cwd)

  return {
    workspace: ws,
    initiative: init,
    config: savedConfig || config
  }
}
