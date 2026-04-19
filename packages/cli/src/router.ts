import path from 'node:path'
import { createLocalDaemon } from '@opengtm/daemon'
import { normalizeAutonomyMode } from './autonomy.js'
import { DEFAULT_RUNTIME_DIR, loadOpenGtmConfig } from './config.js'
import { handleApprovals } from './handlers/approvals.js'
import { handleArtifacts } from './handlers/artifacts.js'
import { handleBuildRun } from './handlers/build.js'
import { handleConnectors } from './handlers/connectors.js'
import { handleDaemonStatus } from './handlers/daemon.js'
import { handleEvals } from './handlers/evals.js'
import { handleFeedback } from './handlers/feedback.js'
import { handleInit } from './handlers/init.js'
import { handleMemory } from './handlers/memory.js'
import { handleOpenGtmSmoke } from './handlers/opengtm.js'
import { handleOpsRun } from './handlers/ops.js'
import { handleResearchRun } from './handlers/research.js'
import { handleTraces } from './handlers/traces.js'
import { handleWorkflowCatalog, handleWorkflowRun } from './handlers/workflows.js'
import { OPEN_GTM_CLI_COMMANDS, parseCliArgs } from './parse.js'

export function createCliRouter() {
  return async function route(args: string[]) {
    const parsed = parseCliArgs(args)
    const cwd = process.cwd()
    const config = await loadOpenGtmConfig(cwd)
    const runtimeDir = config?.runtimeDir || DEFAULT_RUNTIME_DIR
    const autonomyMode = normalizeAutonomyMode(parsed.flags.autonomy, config?.autonomyMode ?? 'off')
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
        daemon,
        autonomyMode
      })
    }

    if (parsed.command === 'run' && parsed.subcommand === 'research') {
      const goal = parsed.positional[0] || 'default goal'
      return handleResearchRun({
        goal,
        daemon,
        workspaceId: config?.workspaceId,
        initiativeId: config?.initiativeId,
        autonomyMode
      })
    }

    if (parsed.command === 'run' && parsed.subcommand === 'build') {
      const goal = parsed.positional[0] || 'default goal'
      return handleBuildRun({
        goal,
        daemon,
        workspaceId: config?.workspaceId,
        initiativeId: config?.initiativeId,
        autonomyMode
      })
    }

    if (parsed.command === 'run' && parsed.subcommand === 'ops') {
      const goal = parsed.positional[0] || 'default goal'
      return handleOpsRun({
        goal,
        daemon,
        workspaceId: config?.workspaceId,
        initiativeId: config?.initiativeId,
        autonomyMode
      })
    }

    if (parsed.command === 'run' && parsed.subcommand === 'workflow') {
      const workflowId = parsed.positional[0]
      if (!workflowId) {
        throw new Error('Workflow id is required for run workflow.')
      }
      const goal = parsed.positional.slice(1).join(' ') || undefined
      return handleWorkflowRun({
        daemon,
        workflowId,
        goal,
        workspaceId: config?.workspaceId,
        initiativeId: config?.initiativeId,
        autonomyMode
      })
    }

    if ((parsed.command === 'run' && parsed.subcommand === 'opengtm') || parsed.command === 'opengtm') {
      return handleOpenGtmSmoke()
    }

    if (parsed.command === 'daemon' && parsed.subcommand === 'status') {
      return handleDaemonStatus({ daemon })
    }

    if (parsed.command === 'approvals') {
      const action = parsed.subcommand === 'approve' || parsed.subcommand === 'deny' || parsed.subcommand === 'list'
        ? parsed.subcommand
        : 'list'
      return handleApprovals({
        daemon,
        action,
        id: action === 'approve' || action === 'deny' ? parsed.positional[0] : undefined
      })
    }

    if (parsed.command === 'traces') {
      const action = parsed.subcommand === 'show' || parsed.subcommand === 'replay' || parsed.subcommand === 'rerun'
        ? parsed.subcommand
        : 'list'
      return handleTraces({
        daemon,
        action,
        id: action === 'list' ? undefined : parsed.positional[0],
        workspaceId: config?.workspaceId,
        initiativeId: config?.initiativeId,
        autonomyMode
      })
    }

    if (parsed.command === 'workflow') {
      return handleWorkflowCatalog()
    }

    if (parsed.command === 'evals' && parsed.subcommand === 'run') {
      return handleEvals({
        suite: parsed.positional[0]
      })
    }

    if (parsed.command === 'feedback') {
      const action = parsed.subcommand === 'record' ? 'record' : 'list'
      return handleFeedback({
        daemon,
        action,
        feedbackAction: action === 'record' ? parsed.positional[0] as any : undefined,
        traceId: action === 'record' ? parsed.positional[1] : undefined,
        message: typeof parsed.flags.message === 'string' ? parsed.flags.message : undefined,
        actor: typeof parsed.flags.actor === 'string' ? parsed.flags.actor : undefined,
        artifactId: typeof parsed.flags.artifact === 'string' ? parsed.flags.artifact : undefined,
        approvalRequestId: typeof parsed.flags.approval === 'string' ? parsed.flags.approval : undefined,
        workflowId: typeof parsed.flags.workflow === 'string' ? parsed.flags.workflow : undefined,
        persona: typeof parsed.flags.persona === 'string' ? parsed.flags.persona : undefined
      })
    }

    if (parsed.command === 'artifacts' && parsed.subcommand === 'list') {
      return handleArtifacts({ daemon })
    }

    if (parsed.command === 'memory' && parsed.subcommand === 'list') {
      return handleMemory({ daemon })
    }

    if (parsed.command === 'connector' && parsed.subcommand === 'list') {
      return handleConnectors({ daemon })
    }

    return { error: `Unknown command: ${parsed.command}` }
  }
}
