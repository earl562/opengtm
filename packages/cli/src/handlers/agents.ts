import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { OpenGtmConfig } from '../config.js'
import { getAgentCatalogEntry, listAgentCatalog } from '../catalog.js'
import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import {
  createArtifactRecord,
  createApprovalRequest,
  createGtmAgenticHarnessJobs,
  createPolicyDecision,
  createRunTrace,
  runLocalGtmAgenticHarness,
  transitionWorkItem,
  updateAgentJob,
  updateRunTrace
} from '@opengtm/core'
import { upsertRecord, writeArtifactBlob } from '@opengtm/storage'
import type { OpenGtmAgenticHarnessMotion, OpenGtmAgentJob } from '@opengtm/types'

type AgentHandlerAction = 'list' | 'show' | 'new' | 'job-list' | 'job-create' | 'job-update' | 'harness-run'

function toSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

async function loadCustomAgents(cwd: string) {
  const root = path.join(cwd, '.opengtm', 'agents')
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const agents = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map(async (entry) => {
          const fullPath = path.join(root, entry.name)
          const raw = await readFile(fullPath, 'utf-8')
          return {
            ...JSON.parse(raw),
            source: 'custom' as const,
            path: fullPath
          }
        })
    )
    return agents
  } catch {
    return []
  }
}

function renderAgentJob(job: OpenGtmAgentJob) {
  return {
    id: job.id,
    agentType: job.agentType,
    lane: job.lane,
    goal: job.goal,
    status: job.status,
    progress: job.progress,
    summary: job.summary,
    constraints: job.constraints,
    requiredOutputs: job.requiredOutputs,
    parentJobId: job.parentJobId,
    dependsOnJobIds: job.dependsOnJobIds,
    sourceIds: job.sourceIds,
    artifactIds: job.artifactIds,
    approvalRequestId: job.approvalRequestId,
    traceId: job.traceId,
    updatedAt: job.updatedAt
  }
}

function summarizeAgentJobs(jobs: OpenGtmAgentJob[]) {
  return {
    total: jobs.length,
    queued: jobs.filter((job) => job.status === 'queued').length,
    running: jobs.filter((job) => job.status === 'running').length,
    awaitingApproval: jobs.filter((job) => job.status === 'awaiting-approval').length,
    completed: jobs.filter((job) => job.status === 'completed').length
  }
}

export async function handleAgents(args: {
  cwd: string
  config: OpenGtmConfig | null
  daemon?: OpenGtmLocalDaemon
  action: AgentHandlerAction
  agentId?: string
  jobId?: string
  goal?: string
  lane?: string
  status?: string
  progress?: number | null
  summary?: string | null
  constraints?: string[]
  requiredOutputs?: string[]
  artifactIds?: string[]
  sourceIds?: string[]
  motion?: OpenGtmAgenticHarnessMotion
  doNotSend?: boolean
}) {
  const builtIn = listAgentCatalog().map((agent) => ({
    ...agent,
    source: 'built-in' as const,
    path: null
  }))
  const custom = await loadCustomAgents(args.cwd)
  const allAgents = [...builtIn, ...custom]

  if (args.action === 'list') {
    return {
      kind: 'agents',
      action: 'list',
      agents: allAgents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        persona: agent.persona,
        description: agent.description,
        source: agent.source
      })),
      nextAction: 'Use `opengtm agent show <id>` for details or `opengtm agent new <name>` to scaffold a custom agent.'
    }
  }

  if (args.action === 'show') {
    const builtInAgent = args.agentId ? getAgentCatalogEntry(args.agentId) : null
    const customAgent = allAgents.find((agent) => agent.id === args.agentId && agent.source === 'custom')
    const agent = builtInAgent
      ? { ...builtInAgent, source: 'built-in' as const, path: null }
      : customAgent

    if (!agent) {
      throw new Error(`Unknown agent: ${args.agentId}`)
    }

    return {
      kind: 'agents',
      action: 'show',
      agent,
      nextAction: 'Review model, persona, and recommended skills before using this agent in a workflow.'
    }
  }

  if (args.action === 'job-list') {
    const jobs = args.daemon?.listAgentJobs({
      workspaceId: args.config?.workspaceId,
      initiativeId: args.config?.initiativeId,
      status: args.status
    }) || []

    return {
      kind: 'agents',
      action: 'job-list',
      jobs: jobs.map(renderAgentJob),
      summary: summarizeAgentJobs(jobs),
      nextAction: 'Use `opengtm agent job create <agent-type> "<goal>"` to persist a new GTM engineering delegation.'
    }
  }

  if (args.action === 'harness-run') {
    if (!args.daemon) {
      throw new Error('Agentic harness execution requires the local daemon.')
    }
    if (!args.config?.workspaceId || !args.config?.initiativeId) {
      throw new Error('Agentic harness execution requires an initialized workspace. Run `opengtm init` first.')
    }
    if (!args.goal) {
      throw new Error('Agentic harness execution requires a goal.')
    }

    const workItem = args.daemon.createWorkItem({
      workspaceId: args.config.workspaceId,
      initiativeId: args.config.initiativeId,
      workflowId: 'gtm.agentic_harness',
      workflowRunId: null,
      ownerLane: 'ops-automate',
      title: `Agentic harness: ${args.goal}`,
      goal: args.goal,
      riskLevel: 'medium',
      constraints: [
        'human approval before external send',
        'artifact-backed context',
        'bounded subagent jobs'
      ],
      requiredOutputs: [
        'preflight decision',
        'research/account intelligence',
        'approval-ready action',
        'trace-linked learning hooks'
      ],
      sourceIds: args.sourceIds || []
    })

    const jobSet = createGtmAgenticHarnessJobs({
      workspaceId: args.config.workspaceId,
      initiativeId: args.config.initiativeId,
      workItemId: workItem.id,
      goal: args.goal,
      motion: args.motion
    })

    for (const job of jobSet.jobs) {
      upsertRecord(args.daemon.storage, 'agent_jobs', job)
    }

    const execution = runLocalGtmAgenticHarness({
      plan: jobSet.plan,
      jobs: jobSet.jobs,
      doNotSend: args.doNotSend
    })

    const policyDecision = execution.status === 'awaiting-approval'
      ? createPolicyDecision({
          workItemId: workItem.id,
          lane: 'ops-automate',
          actionType: 'send-message',
          connectorFamily: 'email',
          target: args.goal,
          riskLevel: 'medium',
          decision: 'requires-approval',
          approvalRequired: true,
          reason: 'OpenGTM agentic harness requires human approval before outreach leaves the system.'
        })
      : null
    const approval = policyDecision
      ? createApprovalRequest({
          workspaceId: args.config.workspaceId,
          workItemId: workItem.id,
          lane: 'ops-automate',
          actionSummary: `Approve GTM harness outreach for ${jobSet.plan.targetEntity}`,
          riskLevel: 'medium',
          target: args.goal,
          decisionRef: policyDecision.id
        })
      : null

    if (policyDecision) {
      upsertRecord(args.daemon.storage, 'policy_decisions', policyDecision)
    }
    if (approval) {
      upsertRecord(args.daemon.storage, 'approval_requests', approval)
    }

    const trace = createRunTrace({
      workItemId: workItem.id,
      workflowId: 'gtm.agentic_harness',
      lane: 'ops-automate',
      status: execution.status,
      persona: 'GTM Engineer',
      fixtureSetId: 'gtm-agentic-harness',
      steps: execution.stageResults.map((result) => ({
        name: result.stageId,
        status: result.status,
        jobId: result.jobId,
        summary: result.summary
      })),
      policyDecisionIds: policyDecision ? [policyDecision.id] : [],
      observedFacts: [
        {
          kind: 'agentic-harness-principles',
          count: jobSet.plan.principles.length,
          ids: jobSet.plan.principles.map((principle) => principle.id)
        }
      ],
      inferences: execution.stageResults.map((result) => ({
        stageId: result.stageId,
        summary: result.summary
      })),
      actionRequests: approval
        ? execution.actionRequests.map((request) => ({
            ...request,
            approvalRequestId: approval.id
          }))
        : execution.actionRequests,
      endedAt: execution.status === 'completed' || execution.status === 'blocked'
        ? new Date().toISOString()
        : null
    })

    const artifact = createArtifactRecord({
      workspaceId: args.config.workspaceId,
      initiativeId: args.config.initiativeId,
      kind: 'decision-log',
      lane: 'ops-automate',
      title: `GTM agentic harness: ${jobSet.plan.targetEntity}`,
      traceRef: trace.id,
      sourceIds: [
        ...jobSet.jobs.map((job) => job.id),
        ...(approval ? [approval.id] : []),
        ...(policyDecision ? [policyDecision.id] : [])
      ],
      provenance: [
        'opengtm:gtm-agentic-harness',
        `motion:${jobSet.plan.motion}`,
        `status:${execution.status}`
      ]
    })
    const artifactPath = writeArtifactBlob(args.daemon.storage, {
      workspaceSlug: 'global',
      artifactId: artifact.id,
      content: {
        plan: jobSet.plan,
        execution: {
          status: execution.status,
          summary: execution.summary,
          stageResults: execution.stageResults,
          actionRequests: approval
            ? execution.actionRequests.map((request) => ({
                ...request,
                approvalRequestId: approval.id
              }))
            : execution.actionRequests
        },
        jobs: execution.jobs.map(renderAgentJob),
        approvalRequestId: approval?.id || null,
        policyDecisionId: policyDecision?.id || null
      }
    })
    const storedArtifact = {
      ...artifact,
      contentRef: artifactPath
    }

    upsertRecord(args.daemon.storage, 'artifacts', storedArtifact)
    const traceWithArtifact = updateRunTrace(trace, {
      artifactIds: [artifact.id]
    })
    upsertRecord(args.daemon.storage, 'run_traces', traceWithArtifact)

    const finalWorkItem = execution.status === 'completed'
      ? transitionWorkItem(transitionWorkItem(workItem, 'running'), 'completed')
      : transitionWorkItem(workItem, execution.status === 'blocked' ? 'blocked' : 'awaiting-approval')
    upsertRecord(args.daemon.storage, 'work_items', finalWorkItem)

    const jobsWithRefs = execution.jobs.map((job) => updateAgentJob(job, {
      traceId: trace.id,
      artifactIds: [...job.artifactIds, artifact.id],
      approvalRequestId: approval && (job.status === 'awaiting-approval' || job.metadata?.stageId === 'orchestrator')
        ? approval.id
        : job.approvalRequestId,
      updatedAt: new Date().toISOString()
    }))

    for (const job of jobsWithRefs) {
      upsertRecord(args.daemon.storage, 'agent_jobs', job)
    }

    return {
      kind: 'agents',
      action: 'harness-run',
      harness: {
        id: jobSet.plan.id,
        motion: jobSet.plan.motion,
        targetEntity: jobSet.plan.targetEntity,
        status: execution.status,
        summary: execution.summary,
        traceId: trace.id,
        artifactId: artifact.id,
        artifactPath,
        approvalRequestId: approval?.id || null,
        coordinatorJobId: jobSet.coordinatorJob.id,
        stageCount: jobSet.plan.stages.length,
        principles: jobSet.plan.principles.map((principle) => principle.id)
      },
      jobs: jobsWithRefs.map(renderAgentJob),
      summary: summarizeAgentJobs(jobsWithRefs),
      nextAction: approval
        ? `Review with \`opengtm approvals approve ${approval.id}\` or inspect \`${artifactPath}\`.`
        : `Inspect the harness artifact at ${artifactPath}.`
    }
  }

  if (args.action === 'job-create') {
    if (!args.daemon) {
      throw new Error('Agent job creation requires the local daemon.')
    }
    if (!args.config?.workspaceId || !args.config?.initiativeId) {
      throw new Error('Agent job creation requires an initialized workspace. Run `opengtm init` first.')
    }
    if (!args.agentId) {
      throw new Error('Agent job creation requires an agent type.')
    }
    if (!args.goal) {
      throw new Error('Agent job creation requires a goal.')
    }

    const job = args.daemon.createAgentJob({
      workspaceId: args.config.workspaceId,
      initiativeId: args.config.initiativeId,
      lane: args.lane || 'build-integrate',
      agentType: args.agentId,
      goal: args.goal,
      constraints: args.constraints || [],
      requiredOutputs: args.requiredOutputs || [],
      sourceIds: args.sourceIds || []
    })

    return {
      kind: 'agents',
      action: 'job-create',
      job: renderAgentJob(job),
      nextAction: `Track with \`opengtm agent job update ${job.id} --status running --summary "..."\` or list with \`opengtm agent job list\`.`
    }
  }

  if (args.action === 'job-update') {
    if (!args.daemon) {
      throw new Error('Agent job update requires the local daemon.')
    }
    if (!args.jobId) {
      throw new Error('Agent job update requires a job id.')
    }

    const job = args.daemon.updateAgentJob(args.jobId, {
      status: args.status,
      progress: args.progress,
      summary: args.summary,
      artifactIds: args.artifactIds,
      sourceIds: args.sourceIds
    })

    return {
      kind: 'agents',
      action: 'job-update',
      job: renderAgentJob(job),
      nextAction: job.status === 'completed'
        ? 'Review linked artifacts and keep the job ledger as completion evidence.'
        : `Continue updating ${job.id} as the delegated work changes state.`
    }
  }

  if (!args.agentId) {
    throw new Error('Agent scaffolding requires a name.')
  }

  const agentId = toSlug(args.agentId)
  const agentsDir = path.join(args.cwd, '.opengtm', 'agents')
  const agentPath = path.join(agentsDir, `${agentId}.json`)
  await mkdir(agentsDir, { recursive: true })

  const agent = {
    id: agentId,
    name: args.agentId,
    persona: 'cross',
    description: `Custom OpenGTM agent scaffold for ${args.agentId}.`,
    defaultModel: args.config?.preferences?.currentModel || 'gpt-5.4',
    recommendedSkills: [],
    source: 'custom' as const,
    path: agentPath
  }

  await writeFile(`${agentPath}`, `${JSON.stringify(agent, null, 2)}\n`, 'utf-8')

  return {
    kind: 'agents',
    action: 'new',
    agent,
    nextAction: `Edit ${agentPath} to define the agent's role, default model, and skill bindings.`
  }
}
