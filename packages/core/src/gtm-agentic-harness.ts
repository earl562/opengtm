import { createAgentJob, updateAgentJob } from './agent-job.js'
import { createEntityBase } from './utils.js'
import type {
  OpenGtmAgentJob,
  OpenGtmAgenticHarnessExecution,
  OpenGtmAgenticHarnessJobSet,
  OpenGtmAgenticHarnessMotion,
  OpenGtmAgenticHarnessPlan,
  OpenGtmAgenticHarnessPlanInput,
  OpenGtmAgenticHarnessPrinciple,
  OpenGtmAgenticHarnessStage,
  OpenGtmAgenticHarnessStageResult,
  OpenGtmAgentJobStatus,
  OpenGtmConnectorFamily,
  OpenGtmLane,
  OpenGtmUnknownMap
} from '@opengtm/types'

export const OPEN_GTM_AGENTIC_HARNESS_PRINCIPLES: OpenGtmAgenticHarnessPrinciple[] = [
  {
    id: 'human-in-the-loop',
    label: 'Human approval before external send',
    source: 'LangChain GTM agent post',
    implementation: 'Draft-producing stages stop in awaiting-approval and carry an approval request instead of sending.'
  },
  {
    id: 'do-not-send-first',
    label: 'Cautious preflight before generation',
    source: 'LangChain GTM agent post',
    implementation: 'The first worker checks recent outreach, support context, and relationship state before drafting.'
  },
  {
    id: 'orchestrator-worker',
    label: 'Bounded orchestrator-worker delegation',
    source: 'Architectural Design Decisions in AI Agent Harnesses',
    implementation: 'A coordinator owns the run while stage jobs have constrained lanes, dependencies, outputs, and connector families.'
  },
  {
    id: 'artifact-backed-context',
    label: 'Artifact-backed context and compression',
    source: 'Agent harness and terminal-agent context engineering papers',
    implementation: 'Stages persist compact summaries and source ids instead of relying on transient chat history.'
  },
  {
    id: 'trace-linked-learning',
    label: 'Feedback and eval loops tied to traces',
    source: 'LangChain GTM agent post',
    implementation: 'The learning stage records style/eval observations as structured output linked back to the harness run.'
  }
]

const DEFAULT_CONTEXT_POLICY = {
  persistence: 'artifact-backed',
  compression: 'observation-summary',
  maxEvidenceItems: 8
} as const

export function createGtmAgenticHarnessPlan(
  input: OpenGtmAgenticHarnessPlanInput
): OpenGtmAgenticHarnessPlan {
  const base = createEntityBase(input)
  const motion = input.motion || inferGtmHarnessMotion(input.goal)
  const targetEntity = input.targetEntity || inferTargetEntity(input.goal)

  return {
    ...base,
    workspaceId: input.workspaceId,
    initiativeId: input.initiativeId,
    workItemId: input.workItemId || null,
    goal: input.goal,
    targetEntity,
    motion,
    status: 'queued',
    stages: createStagesForMotion({ motion, goal: input.goal, targetEntity }),
    safety: {
      humanApprovalRequired: true,
      doNotSendChecks: [
        'recent teammate or rep outreach',
        'open support escalation',
        'customer/prospect relationship state',
        'missing or low-confidence account context'
      ],
      approvalRequiredActions: ['send-message', 'mutate-connector', 'enroll-sequence']
    },
    principles: OPEN_GTM_AGENTIC_HARNESS_PRINCIPLES
  }
}

export function createGtmAgenticHarnessJobs(
  input: OpenGtmAgenticHarnessPlanInput
): OpenGtmAgenticHarnessJobSet {
  const plan = createGtmAgenticHarnessPlan(input)
  const coordinatorJob = createAgentJob({
    workspaceId: plan.workspaceId,
    initiativeId: plan.initiativeId,
    workItemId: plan.workItemId,
    lane: 'ops-automate',
    agentType: 'gtm-orchestrator',
    goal: `Coordinate ${plan.motion} harness for ${plan.targetEntity}`,
    constraints: [
      'persist every handoff',
      'respect approval gates before external mutation',
      'prefer compact evidence summaries over raw transcript carryover'
    ],
    requiredOutputs: [
      'stage status ledger',
      'trace-linked run artifact',
      'operator next action'
    ],
    metadata: {
      harnessPlanId: plan.id,
      stageId: 'orchestrator',
      motion: plan.motion
    },
    createdAt: plan.createdAt
  })

  const stageJobByStageId = new Map<string, OpenGtmAgentJob>()
  const stageJobs: OpenGtmAgentJob[] = []

  for (const stage of plan.stages) {
    const dependsOnJobIds = stage.dependsOnStageIds
      .map((stageId) => stageJobByStageId.get(stageId)?.id)
      .filter((id): id is string => Boolean(id))
    const job = createAgentJob({
      workspaceId: plan.workspaceId,
      initiativeId: plan.initiativeId,
      workItemId: plan.workItemId,
      parentJobId: coordinatorJob.id,
      dependsOnJobIds,
      lane: stage.lane,
      agentType: stage.agentType,
      goal: stage.goal,
      constraints: [
        `connector families: ${stage.connectorFamilies.join(', ') || 'none'}`,
        stage.approvalRequired ? 'stop at approval boundary' : 'read/synthesize only'
      ],
      requiredOutputs: stage.requiredOutputs,
      metadata: {
        harnessPlanId: plan.id,
        stageId: stage.id,
        motion: plan.motion,
        contextPolicy: stage.contextPolicy
      },
      createdAt: plan.createdAt
    })
    stageJobByStageId.set(stage.id, job)
    stageJobs.push(job)
  }

  return {
    plan,
    coordinatorJob,
    stageJobs,
    jobs: [coordinatorJob, ...stageJobs]
  }
}

export function runLocalGtmAgenticHarness(args: {
  plan: OpenGtmAgenticHarnessPlan
  jobs: OpenGtmAgentJob[]
  updatedAt?: string | Date
  doNotSend?: boolean
}): OpenGtmAgenticHarnessExecution {
  const updatedAt = args.updatedAt || new Date()
  const byStageId = new Map<string, OpenGtmAgentJob>()
  const coordinator = args.jobs.find((job) => job.metadata?.stageId === 'orchestrator') || args.jobs[0]

  for (const job of args.jobs) {
    const stageId = typeof job.metadata?.stageId === 'string' ? job.metadata.stageId : null
    if (stageId) {
      byStageId.set(stageId, job)
    }
  }

  const stageResults: OpenGtmAgenticHarnessStageResult[] = []
  const nextJobs = new Map(args.jobs.map((job) => [job.id, job]))
  const doNotSend = args.doNotSend ?? inferDoNotSend(args.plan.goal)

  for (const stage of args.plan.stages) {
    const job = byStageId.get(stage.id)
    if (!job) continue

    const running = updateAgentJob(job, {
      status: 'running',
      progress: 50,
      summary: `Running ${stage.label}`,
      updatedAt
    })
    const result = buildStageResult({
      plan: args.plan,
      stage,
      job: running,
      doNotSend
    })
    const completedStatus = resolveStageStatus(stage, doNotSend)
    const completed = updateAgentJob(running, {
      status: completedStatus,
      progress: completedStatus === 'awaiting-approval' || completedStatus === 'blocked' ? 90 : 100,
      summary: result.summary,
      output: result.output,
      error: completedStatus === 'blocked'
        ? {
            code: 'DO_NOT_SEND_PREFLIGHT',
            message: 'Preflight detected a reason to avoid outreach until a rep reviews context.'
          }
        : null,
      updatedAt
    })

    nextJobs.set(completed.id, completed)
    stageResults.push({
      ...result,
      status: completed.status
    })

    if (completed.status === 'blocked') {
      break
    }
  }

  const actionRequests = stageResults
    .filter((result) => result.status === 'awaiting-approval')
    .map((result) => ({
      stageId: result.stageId,
      jobId: result.jobId,
      action: 'send-message',
      reason: 'Human review is required before outreach leaves OpenGTM.'
    }))

  const status: OpenGtmAgentJobStatus = stageResults.some((result) => result.status === 'blocked')
    ? 'blocked'
    : actionRequests.length > 0
      ? 'awaiting-approval'
      : 'completed'

  if (coordinator) {
    const activeCoordinator = coordinator.status === 'queued'
      ? updateAgentJob(coordinator, {
          status: 'running',
          progress: 10,
          summary: `Coordinating ${args.plan.motion} harness`,
          updatedAt
        })
      : coordinator

    nextJobs.set(coordinator.id, updateAgentJob(activeCoordinator, {
      status,
      progress: status === 'completed' ? 100 : 90,
      summary: summarizeHarnessExecution(args.plan, status),
      output: {
        planId: args.plan.id,
        motion: args.plan.motion,
        targetEntity: args.plan.targetEntity,
        stageResults: stageResults.map((result) => ({
          stageId: result.stageId,
          status: result.status,
          summary: result.summary
        })),
        actionRequests
      },
      updatedAt
    }))
  }

  return {
    planId: args.plan.id,
    status,
    summary: summarizeHarnessExecution(args.plan, status),
    jobs: args.jobs.map((job) => nextJobs.get(job.id) || job),
    stageResults,
    actionRequests
  }
}

export function inferGtmHarnessMotion(goal: string): OpenGtmAgenticHarnessMotion {
  const normalized = goal.toLowerCase()
  if (/(health|renewal|expansion|deal risk|account brief|account intelligence|usage)/.test(normalized)) {
    return 'account-intelligence'
  }
  if (/(inbound|lead|follow.?up|qualif)/.test(normalized)) {
    return 'inbound-lead'
  }
  return 'outbound-research'
}

function createStagesForMotion(args: {
  motion: OpenGtmAgenticHarnessMotion
  goal: string
  targetEntity: string
}): OpenGtmAgenticHarnessStage[] {
  if (args.motion === 'account-intelligence') {
    return [
      stage({
        id: 'account-signal-research',
        label: 'Account signal research',
        lane: 'research',
        agentType: 'account-intelligence-researcher',
        goal: `Collect product, CRM, meeting, support, and market signals for ${args.targetEntity}`,
        connectorFamilies: ['crm', 'warehouse', 'meeting_intelligence', 'support', 'web_research'],
        requiredOutputs: ['signal summary', 'risk evidence', 'expansion evidence']
      }),
      stage({
        id: 'account-prioritization',
        label: 'Account prioritization',
        lane: 'research',
        agentType: 'gtm-prioritizer',
        goal: `Prioritize ${args.targetEntity} actions for the rep and explain the evidence`,
        dependsOnStageIds: ['account-signal-research'],
        connectorFamilies: ['crm', 'warehouse'],
        requiredOutputs: ['ranked actions', 'why now rationale', 'recommended owner']
      }),
      stage({
        id: 'feedback-learning',
        label: 'Feedback learning',
        lane: 'ops-automate',
        agentType: 'gtm-learning-collector',
        goal: `Prepare trace-linked learning hooks for ${args.targetEntity}`,
        dependsOnStageIds: ['account-prioritization'],
        connectorFamilies: ['docs'],
        requiredOutputs: ['eval checklist', 'feedback capture plan', 'memory compaction note']
      })
    ]
  }

  return [
    stage({
      id: 'preflight-safety',
      label: 'Preflight safety',
      lane: 'ops-automate',
      agentType: 'gtm-preflight-guard',
      goal: `Check whether OpenGTM should avoid outreach for ${args.targetEntity}`,
      connectorFamilies: ['crm', 'support', 'comms'],
      requiredOutputs: ['do-not-send decision', 'relationship state', 'recent contact summary']
    }),
    stage({
      id: 'lead-research',
      label: 'Lead research',
      lane: 'research',
      agentType: 'sales-research-subagent',
      goal: `Research ${args.targetEntity} with CRM, meeting, enrichment, and web context`,
      dependsOnStageIds: ['preflight-safety'],
      connectorFamilies: ['crm', 'enrichment', 'meeting_intelligence', 'web_research'],
      requiredOutputs: ['account context', 'persona context', 'source-backed buying hypothesis']
    }),
    stage({
      id: 'account-intelligence',
      label: 'Account intelligence',
      lane: 'research',
      agentType: 'account-intelligence-subagent',
      goal: `Surface expansion, risk, and timing signals for ${args.targetEntity}`,
      dependsOnStageIds: ['lead-research'],
      connectorFamilies: ['crm', 'warehouse', 'meeting_intelligence', 'web_research'],
      requiredOutputs: ['expansion signals', 'deal risks', 'next best contact']
    }),
    stage({
      id: 'outreach-draft',
      label: 'Outreach draft',
      lane: 'ops-automate',
      agentType: 'outreach-composer',
      goal: `Draft relationship-aware outreach for ${args.targetEntity}`,
      dependsOnStageIds: ['preflight-safety', 'lead-research', 'account-intelligence'],
      connectorFamilies: ['email', 'comms', 'crm'],
      requiredOutputs: ['draft message', 'reasoning', 'sources', 'follow-up options'],
      approvalRequired: true
    }),
    stage({
      id: 'feedback-learning',
      label: 'Feedback learning',
      lane: 'ops-automate',
      agentType: 'gtm-learning-collector',
      goal: `Capture rep feedback and eval hooks for ${args.targetEntity}`,
      dependsOnStageIds: ['outreach-draft'],
      connectorFamilies: ['docs'],
      requiredOutputs: ['style memory observation', 'eval assertions', 'trace feedback hook']
    })
  ]
}

function stage(input: Omit<OpenGtmAgenticHarnessStage, 'contextPolicy' | 'approvalRequired' | 'dependsOnStageIds'> & {
  dependsOnStageIds?: string[]
  approvalRequired?: boolean
}): OpenGtmAgenticHarnessStage {
  return {
    ...input,
    dependsOnStageIds: input.dependsOnStageIds || [],
    approvalRequired: input.approvalRequired || false,
    contextPolicy: DEFAULT_CONTEXT_POLICY
  }
}

function buildStageResult(args: {
  plan: OpenGtmAgenticHarnessPlan
  stage: OpenGtmAgenticHarnessStage
  job: OpenGtmAgentJob
  doNotSend: boolean
}): Omit<OpenGtmAgenticHarnessStageResult, 'status'> {
  const base = {
    stageId: args.stage.id,
    jobId: args.job.id
  }

  if (args.stage.id === 'preflight-safety') {
    return {
      ...base,
      summary: args.doNotSend
        ? 'Preflight found recent contact or support context; outreach is blocked for review.'
        : 'Preflight cleared outreach with no recent teammate contact or support escalation.',
      output: {
        doNotSend: args.doNotSend,
        relationshipState: args.plan.motion === 'inbound-lead' ? 'warm-prospect' : 'cold-prospect',
        recentOutreachCount: args.doNotSend ? 1 : 0,
        checked: args.plan.safety.doNotSendChecks
      }
    }
  }

  if (args.stage.id === 'lead-research') {
    return {
      ...base,
      summary: `Built source-backed lead context for ${args.plan.targetEntity}.`,
      output: {
        targetEntity: args.plan.targetEntity,
        hypothesis: `${args.plan.targetEntity} is evaluating agentic GTM workflows and needs governed rollout evidence.`,
        sources: ['crm', 'meeting_intelligence', 'web_research'],
        compressedObservation: `Keep ${args.plan.targetEntity} context to relationship state, current initiative, and one concrete proof point.`
      }
    }
  }

  if (args.stage.id === 'account-intelligence' || args.stage.id === 'account-signal-research') {
    return {
      ...base,
      summary: `Summarized account signals for ${args.plan.targetEntity}.`,
      output: {
        expansionSignals: ['agentic workflow interest', 'multiple GTM stakeholders engaged'],
        riskSignals: ['unclear owner for next action'],
        nextBestContact: 'economic buyer or current champion',
        compressedObservation: 'Retain only high-confidence signals and named owner gaps.'
      }
    }
  }

  if (args.stage.id === 'account-prioritization') {
    return {
      ...base,
      summary: `Ranked account actions for ${args.plan.targetEntity}.`,
      output: {
        rankedActions: [
          'Confirm owner for the next customer conversation',
          'Prepare an account brief with health, risk, and expansion evidence',
          'Schedule a human review before any external follow-up'
        ],
        rationale: 'The account has enough activity to warrant focus, but external action should stay approval-gated.'
      }
    }
  }

  if (args.stage.id === 'outreach-draft') {
    return {
      ...base,
      summary: args.doNotSend
        ? 'Draft stage blocked because preflight did not clear outreach.'
        : 'Prepared a relationship-aware draft and stopped for human approval.',
      output: args.doNotSend
        ? {
            draftCreated: false,
            blockedReason: 'Recent contact or support context requires a rep to review before automation continues.'
          }
        : {
            draftCreated: true,
            subject: `Thoughtful follow-up for ${args.plan.targetEntity}`,
            bodySummary: `Short, evidence-backed note for ${args.plan.targetEntity} with one GTM-agentic proof point.`,
            rationale: 'Uses relationship state and account signals instead of generic outbound copy.',
            followUps: ['value proof follow-up', 'technical stakeholder follow-up']
          }
    }
  }

  return {
    ...base,
    summary: `Prepared trace-linked learning hooks for ${args.plan.targetEntity}.`,
    output: {
      evalAssertions: ['tool order respected', 'no duplicate draft', 'approval required before send'],
      memoryObservation: 'Capture substantive rep edits as style preferences for future drafts.',
      compactionRule: 'Summarize feedback into tone, brevity, specificity, and examples.'
    }
  }
}

function resolveStageStatus(
  stage: OpenGtmAgenticHarnessStage,
  doNotSend: boolean
): OpenGtmAgentJobStatus {
  if (stage.id === 'outreach-draft') {
    return doNotSend ? 'blocked' : 'awaiting-approval'
  }
  return 'completed'
}

function summarizeHarnessExecution(
  plan: OpenGtmAgenticHarnessPlan,
  status: OpenGtmAgentJobStatus
): string {
  if (status === 'blocked') {
    return `OpenGTM blocked ${plan.motion} for ${plan.targetEntity} at the do-not-send gate.`
  }
  if (status === 'awaiting-approval') {
    return `OpenGTM prepared ${plan.motion} for ${plan.targetEntity} and is waiting for human approval.`
  }
  return `OpenGTM completed ${plan.motion} harness orchestration for ${plan.targetEntity}.`
}

function inferTargetEntity(goal: string): string {
  const stripped = goal
    .replace(/^(research|draft|compose|prepare|scan|check|score|summarize|build|run)\s+/i, '')
    .replace(/^(outreach|email|account brief|account intelligence|health score|deal risk|lead)\s+(for\s+)?/i, '')
    .replace(/^for\s+/i, '')
    .trim()
  return stripped || 'target account'
}

function inferDoNotSend(goal: string): boolean {
  return /(do not send|support ticket|support escalation|recent outreach|already reached|blocked)/i.test(goal)
}
