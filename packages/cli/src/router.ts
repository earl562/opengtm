import { parseCliArgs, OPEN_GTM_CLI_COMMANDS } from './parse.js'
import { DEFAULT_RUNTIME_DIR, loadOpenGtmConfig } from './config.js'
import { handleInit } from './handlers/init.js'
import { handleResearchRun } from './handlers/research.js'
import { handleBuildRun } from './handlers/build.js'
import { handleApprovals } from './handlers/approvals.js'
import { handleDaemonStatus } from './handlers/daemon.js'
import { createLocalDaemon } from '@opengtm/daemon'
import path from 'node:path'

export function createCliRouter() {
  return async function route(args: string[]) {
    const parsed = parseCliArgs(args)
    const cwd = process.cwd()
    const config = await loadOpenGtmConfig(cwd)
    const runtimeDir = config?.runtimeDir || DEFAULT_RUNTIME_DIR
    const daemon = createLocalDaemon({
      rootDir: path.join(cwd, runtimeDir)
    })

    if (parsed.command === 'help' || parsed.command === '--help') {
      return { help: OPEN_GTM_CLI_COMMANDS.join(', ') }
    }

    if (parsed.command === 'init') {
      return handleInit({
        cwd,
        name: parsed.flags.name as string || 'My Workspace',
        initiative: parsed.flags.initiative as string,
        daemon
      })
    }

    if (parsed.command === 'run' && parsed.subcommand === 'research') {
      const goal = parsed.positional[0] || 'default goal'
      return handleResearchRun({
        goal,
        daemon,
        workspaceId: config?.workspaceId,
        initiativeId: config?.initiativeId
      })
    }

    if (parsed.command === 'run' && parsed.subcommand === 'build') {
      const goal = parsed.positional[0] || 'default goal'
      return handleBuildRun({
        goal,
        daemon,
        workspaceId: config?.workspaceId,
        initiativeId: config?.initiativeId
      })
    }

    if (parsed.command === 'daemon' && parsed.subcommand === 'status') {
      return handleDaemonStatus({ daemon })
    }

    if (parsed.command === 'approvals') {
      return handleApprovals({ daemon })
    }

    return { error: `Unknown command: ${parsed.command}` }
  }
}
