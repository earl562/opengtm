import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import type { OpenGtmConfig } from '../config.js'
import { loadGtmSkillArtifacts } from '@opengtm/skills'
import { listReferenceWorkflows } from '../workflows.js'
import { getProviderCatalogEntry, isSeatbeltAvailable, listAgentCatalog } from '../catalog.js'

export async function handleStatus(args: {
  daemon: OpenGtmLocalDaemon
  config: OpenGtmConfig | null
}) {
  const { listRecords } = await import('@opengtm/storage')
  const storage = args.daemon.storage
  const workflows = listReferenceWorkflows()
  const currentProviderId = args.config?.preferences?.currentProvider || 'mock'
  const currentProvider = getProviderCatalogEntry(currentProviderId)
  const currentAuth = args.config?.auth?.[currentProviderId] || null

  return {
    kind: 'status',
    workspace: args.config
      ? {
          id: args.config.workspaceId,
          name: args.config.workspaceName,
          initiativeId: args.config.initiativeId,
          initiativeTitle: args.config.initiativeTitle,
          runtimeDir: args.config.runtimeDir
        }
      : null,
    controlPlane: {
      provider: {
        id: currentProviderId,
        label: currentProvider?.label || currentProviderId,
        configured: currentProviderId === 'mock' ? true : Boolean(currentAuth?.configured),
        authMode: currentAuth?.authMode || currentProvider?.authMode || 'none',
        maskedValue: currentAuth?.maskedValue || null
      },
      model: args.config?.preferences?.currentModel || 'mock-0',
      sandbox: {
        runtime: process.platform === 'darwin' ? 'seatbelt' : 'unsupported',
        available: isSeatbeltAvailable(),
        profile: args.config?.preferences?.sandboxProfile || 'read-only'
      }
    },
    support: {
      liveWorkflows: workflows.filter((workflow) => workflow.supportTier === 'live').length,
      referenceOnlyWorkflows: workflows.filter((workflow) => workflow.supportTier === 'reference-only').length,
      builtInSkills: loadGtmSkillArtifacts().length,
      builtInAgents: listAgentCatalog().length
    },
    inventory: {
      traces: listRecords(storage, 'run_traces').length,
      approvals: listRecords(storage, 'approval_requests').length,
      feedback: listRecords(storage, 'feedback_records').length,
      artifacts: listRecords(storage, 'artifacts').length,
      memory: listRecords(storage, 'memory_records').length
    },
    nextAction: args.config
      ? 'Use `opengtm workflow list` to inspect live/reference workflows, or `opengtm auth login openai` to configure a live model provider.'
      : 'Run `opengtm init` to create a workspace before running workflows.'
  }
}
