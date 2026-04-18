import { parseCliArgs, OPEN_GTM_CLI_COMMANDS } from './parse.js'
import { loadOpenGtmConfig } from './config.js'
import { handleInit } from './handlers/init.js'
import { handleResearchRun } from './handlers/research.js'
import { handleBuildRun } from './handlers/build.js'
import { handleApprovals } from './handlers/approvals.js'
import { handleDaemonStatus } from './handlers/daemon.js'

export function createCliRouter() {
  return async function route(args: string[]) {
    const parsed = parseCliArgs(args)

    if (parsed.command === 'help' || parsed.command === '--help') {
      return { help: OPEN_GTM_CLI_COMMANDS.join(', ') }
    }

    if (parsed.command === 'init') {
      return handleInit({
        cwd: process.cwd(),
        name: parsed.flags.name as string || 'My Workspace',
        initiative: parsed.flags.initiative as string,
        daemon: null as any
      })
    }

    if (parsed.command === 'run' && parsed.subcommand === 'research') {
      const goal = parsed.positional[0] || 'default goal'
      return handleResearchRun({ goal, daemon: null as any })
    }

    if (parsed.command === 'run' && parsed.subcommand === 'build') {
      const goal = parsed.positional[0] || 'default goal'
      return handleBuildRun({ goal, daemon: null as any })
    }

    if (parsed.command === 'daemon' && parsed.subcommand === 'status') {
      return handleDaemonStatus({ daemon: null as any })
    }

    if (parsed.command === 'approvals') {
      return handleApprovals({ daemon: null as any })
    }

    return { error: `Unknown command: ${parsed.command}` }
  }
}