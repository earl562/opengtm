import path from 'node:path'
import { createLocalDaemon } from '@opengtm/daemon'
import { normalizeAutonomyMode } from './autonomy.js'
import { DEFAULT_RUNTIME_DIR, loadOpenGtmConfig } from './config.js'
import { handleApprovals } from './handlers/approvals.js'
import { handleAgents } from './handlers/agents.js'
import { handleArtifacts } from './handlers/artifacts.js'
import { handleAuth } from './handlers/auth.js'
import { handleBuildRun } from './handlers/build.js'
import { handleCode } from './handlers/code.js'
import { handleConnectors } from './handlers/connectors.js'
import { handleDaemonStatus } from './handlers/daemon.js'
import { handleEvals } from './handlers/evals.js'
import { handleFeedback } from './handlers/feedback.js'
import { handleHandoff } from './handlers/handoff.js'
import { handleHelp } from './handlers/help.js'
import { handleInit } from './handlers/init.js'
import { handleLearnReview } from './handlers/learn.js'
import { handleMemory } from './handlers/memory.js'
import { handleModels } from './handlers/models.js'
import { handleOpenGtmSmoke } from './handlers/opengtm.js'
import { handleOpsRun } from './handlers/ops.js'
import { handleProviders } from './handlers/providers.js'
import { handleResearchRun } from './handlers/research.js'
import { handleSandbox } from './handlers/sandbox.js'
import { handleSessionAdvance, handleSessionApproveContinue, handleSessionCards, handleSessionCompact, handleSessionDo, handleSessionNew, handleSessionProgress, handleSessionRuntime, handleSessionStatus, handleSessionTranscript } from './handlers/session.js'
import { handleSkills } from './handlers/skills.js'
import { handleStatus } from './handlers/status.js'
import { handleTools } from './handlers/tools.js'
import { handleTraces } from './handlers/traces.js'
import { handleWorkflowCatalog, handleWorkflowRun } from './handlers/workflows.js'
import { parseCliArgs } from './parse.js'

export function createCliRouter(options: { cwd?: string } = {}) {
  return async function route(args: string[]): Promise<any> {
    const parsed = parseCliArgs(args)
    const cwd = options.cwd || process.cwd()
    const config = await loadOpenGtmConfig(cwd)
    const runtimeDir = config?.runtimeDir || DEFAULT_RUNTIME_DIR
    const autonomyMode = normalizeAutonomyMode(parsed.flags.autonomy, config?.autonomyMode ?? 'off')
    const daemon = createLocalDaemon({
      rootDir: path.join(cwd, runtimeDir)
    })

    if (args.length === 0 || parsed.flags.help || parsed.command === 'help') {
      return handleHelp({ config })
    }

    if (parsed.command === 'status') {
      return handleStatus({ daemon, config })
    }

    if (parsed.command === 'session' && (parsed.subcommand === '' || parsed.subcommand === 'start')) {
      return {
        kind: 'session-launch',
        requiresTty: true,
        cwd,
        nextAction: 'Run this command from an interactive terminal to launch the OpenGTM harness session.'
      }
    }

    if (parsed.command === 'session' && parsed.subcommand === 'new') {
      return handleSessionNew({ cwd })
    }

    if (parsed.command === 'session' && parsed.subcommand === 'cards') {
      return handleSessionCards({
        cwd,
        refresh: Boolean(parsed.flags.refresh) || parsed.positional[0] === 'refresh'
      })
    }

    if (parsed.command === 'session' && parsed.subcommand === 'progress') {
      return handleSessionProgress({ cwd, config })
    }

    if (parsed.command === 'session' && (parsed.subcommand === 'advance' || parsed.subcommand === 'continue' || parsed.subcommand === 'resume')) {
      const resumeRequested = parsed.subcommand === 'resume' || Boolean(parsed.flags.resume) || parsed.positional[0] === 'resume'
      const firstStepToken = parsed.positional[0] === 'resume' ? parsed.positional[1] : parsed.positional[0]
      const rawSteps = typeof parsed.flags.steps === 'string'
        ? Number(parsed.flags.steps)
        : Number(firstStepToken || '3')
      return handleSessionAdvance({
        cwd,
        maxSteps: Number.isFinite(rawSteps) && rawSteps > 0 ? rawSteps : 3,
        resume: resumeRequested
      })
    }

    if (parsed.command === 'session' && parsed.subcommand === 'do') {
      const rawIndex = typeof parsed.flags.slot === 'string' ? Number(parsed.flags.slot) : Number(parsed.positional[0] || '1')
      return handleSessionDo({
        cwd,
        index: Number.isFinite(rawIndex) && rawIndex > 0 ? rawIndex - 1 : 0
      })
    }

    if (parsed.command === 'session' && parsed.subcommand === 'approve-continue') {
      return handleSessionApproveContinue({
        cwd,
        approvalId: parsed.positional[0] || null
      })
    }

    if (parsed.command === 'session' && parsed.subcommand === 'status') {
      return handleSessionStatus({ cwd, config })
    }

    if (parsed.command === 'session' && (parsed.subcommand === 'runtime' || parsed.subcommand === 'now')) {
      return handleSessionRuntime({ cwd, config, daemon })
    }

    if (parsed.command === 'session' && (parsed.subcommand === 'transcript' || parsed.subcommand === 'history')) {
      return handleSessionTranscript({
        cwd,
        limit: typeof parsed.flags.limit === 'string' ? Number(parsed.flags.limit) : undefined
      })
    }

    if (parsed.command === 'session' && parsed.subcommand === 'compact') {
      return handleSessionCompact({ cwd })
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

    if (parsed.command === 'smoke' || (parsed.command === 'run' && parsed.subcommand === 'opengtm')) {
      return handleOpenGtmSmoke()
    }

    if (parsed.command === 'code') {
      return handleCode({
        cwd,
        goal: parsed.tokens.slice(1).join(' ') || 'Inspect the workspace'
      })
    }

    if (parsed.command === 'run' && parsed.subcommand === 'research') {
      const goal = parsed.positional[0] || 'default goal'
      return handleResearchRun({
        cwd,
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
        cwd,
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
        cwd,
        daemon,
        workflowId,
        goal,
        workspaceId: config?.workspaceId,
        initiativeId: config?.initiativeId,
        autonomyMode
      })
    }

    if (parsed.command === 'daemon' && parsed.subcommand === 'status') {
      return handleDaemonStatus({ daemon })
    }

    if (parsed.command === 'auth') {
      const action = parsed.subcommand === 'login' || parsed.subcommand === 'logout' ? parsed.subcommand : 'status'
      return handleAuth({
        cwd,
        config,
        action,
        providerId: action === 'status' ? parsed.positional[0] : parsed.positional[0] || config?.preferences?.currentProvider,
        apiKey: typeof parsed.flags['api-key'] === 'string' ? parsed.flags['api-key'] : undefined,
        apiKeyEnv: typeof parsed.flags['api-key-env'] === 'string' ? parsed.flags['api-key-env'] : undefined,
        baseURL: typeof parsed.flags['base-url'] === 'string' ? parsed.flags['base-url'] : undefined,
        oauthRedirectUrl: typeof parsed.flags['oauth-redirect-url'] === 'string' ? parsed.flags['oauth-redirect-url'] : undefined,
        noOpen: Boolean(parsed.flags['no-open']),
        callbackPort: typeof parsed.flags['callback-port'] === 'string' ? Number(parsed.flags['callback-port']) : undefined
      })
    }

    if (parsed.command === 'provider') {
      const action = parsed.subcommand === 'use' ? 'use' : 'list'
      return handleProviders({
        cwd,
        config,
        action,
        providerId: action === 'use' ? parsed.positional[0] : undefined
      })
    }

    if (parsed.command === 'tool') {
      const action = parsed.subcommand === 'show'
        ? 'show'
        : parsed.subcommand === 'search'
          ? 'search'
          : parsed.subcommand === 'run'
            ? 'run'
          : 'list'
      return handleTools({
        action,
        cwd,
        name: action === 'show' || action === 'run' ? parsed.positional[0] : undefined,
        query: action === 'search' ? parsed.positional.join(' ') : undefined,
        input: action === 'run'
          ? Object.fromEntries(Object.entries(parsed.flags).map(([key, value]) => [key, coerceToolInputValue(value)]))
          : undefined
      })
    }

    if (parsed.command === 'models') {
      const action = parsed.subcommand === 'use' ? 'use' : 'list'
      return handleModels({
        cwd,
        config,
        action,
        providerId: typeof parsed.flags.provider === 'string' ? parsed.flags.provider : undefined,
        modelId: action === 'use' ? parsed.positional[0] : undefined
      })
    }

    if (parsed.command === 'sandbox') {
      if (parsed.subcommand === 'profile' || parsed.subcommand === 'profiles') {
        return handleSandbox({
          cwd,
          daemon,
          config,
          action: 'profile-list'
        })
      }

      const action = parsed.subcommand === 'run'
        ? 'run'
        : parsed.subcommand === 'explain'
          ? 'explain'
          : 'status'

      return handleSandbox({
        cwd,
        daemon,
        config,
        action,
        profileId: typeof parsed.flags.profile === 'string' ? parsed.flags.profile : undefined,
        passthrough: parsed.passthrough,
        preview: Boolean(parsed.flags.preview)
      })
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

    if (parsed.command === 'workflow' && (parsed.subcommand === '' || parsed.subcommand === 'list')) {
      return handleWorkflowCatalog()
    }

    if (parsed.command === 'workflow' && parsed.subcommand === 'run') {
      const workflowId = parsed.positional[0]
      if (!workflowId) {
        throw new Error('Workflow id is required for workflow run.')
      }
      const goal = parsed.positional.slice(1).join(' ') || undefined
      return handleWorkflowRun({
        cwd,
        daemon,
        workflowId,
        goal,
        workspaceId: config?.workspaceId,
        initiativeId: config?.initiativeId,
        autonomyMode
      })
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

     if (parsed.command === 'handoff') {
       return handleHandoff({
         cwd,
         sessionId: parsed.positional[0],
         format: parsed.flags.format as 'markdown' | 'json' | 'text' || 'markdown'
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

    if (parsed.command === 'skill') {
      const action = parsed.subcommand === 'show' || parsed.subcommand === 'new' ? parsed.subcommand : 'list'
      return handleSkills({
        cwd,
        action,
        skillId: action === 'list' ? undefined : parsed.positional[0]
      })
    }

    if (parsed.command === 'agent') {
      if (parsed.subcommand === 'harness') {
        const goalTokens = parsed.positional[0] === 'run'
          ? parsed.positional.slice(1)
          : parsed.positional
        return handleAgents({
          cwd,
          config,
          daemon,
          action: 'harness-run',
          goal: typeof parsed.flags.goal === 'string' ? parsed.flags.goal : goalTokens.join(' '),
          motion: typeof parsed.flags.motion === 'string' ? parsed.flags.motion as any : undefined,
          sourceIds: parseCsvFlag(parsed.flags.sources),
          doNotSend: Boolean(parsed.flags['do-not-send'])
        })
      }

      if (parsed.subcommand === 'job' || parsed.subcommand === 'jobs') {
        const jobAction = parsed.positional[0] || 'list'
        const action = jobAction === 'create' || jobAction === 'run' || jobAction === 'delegate'
          ? 'job-create'
          : jobAction === 'update' || jobAction === 'status'
            ? 'job-update'
            : 'job-list'
        const rawProgress = typeof parsed.flags.progress === 'string'
          ? Number(parsed.flags.progress)
          : null
        return handleAgents({
          cwd,
          config,
          daemon,
          action,
          agentId: action === 'job-create'
            ? (typeof parsed.flags.agent === 'string' ? parsed.flags.agent : parsed.positional[1])
            : undefined,
          jobId: action === 'job-update' ? parsed.positional[1] : undefined,
          goal: action === 'job-create'
            ? (typeof parsed.flags.goal === 'string'
              ? parsed.flags.goal
              : parsed.positional.slice(2).join(' '))
            : undefined,
          lane: typeof parsed.flags.lane === 'string' ? parsed.flags.lane : undefined,
          status: typeof parsed.flags.status === 'string' ? parsed.flags.status : undefined,
          progress: rawProgress !== null && Number.isFinite(rawProgress) ? rawProgress : undefined,
          summary: typeof parsed.flags.summary === 'string' ? parsed.flags.summary : undefined,
          constraints: parseCsvFlag(parsed.flags.constraints),
          requiredOutputs: parseCsvFlag(parsed.flags.outputs),
          artifactIds: parseCsvFlag(parsed.flags.artifacts),
          sourceIds: parseCsvFlag(parsed.flags.sources)
        })
      }

      const action = parsed.subcommand === 'show' || parsed.subcommand === 'new' ? parsed.subcommand : 'list'
      return handleAgents({
        cwd,
        config,
        daemon,
        action,
        agentId: action === 'list' ? undefined : parsed.positional[0]
      })
    }

    if (parsed.command === 'learn') {
      return handleLearnReview({
        cwd,
        daemon,
        config
      })
    }

    return { error: `Unknown command: ${parsed.command}` }
  }
}

function coerceToolInputValue(value: string | boolean) {
  if (typeof value === 'boolean') return value
  const trimmed = value.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }
  return value
}

function parseCsvFlag(value: string | boolean | undefined): string[] | undefined {
  if (typeof value !== 'string') return undefined
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}
