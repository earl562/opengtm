import {
  executeConnectorAction,
  findConnectorContract,
  type ConnectorActionInput
} from '@opengtm/connectors'
import type {
  MemoryManager,
  MemorySearchHit,
  WorkingContext,
  ContextBudget,
  ContextBudgetState,
  ContextBudgetStatus
} from '@opengtm/memory'
import type { JsonlRunLogger } from '@opengtm/observability'
import {
  createApprovalRequestForDecision,
  createPolicyDecisionFromAction,
  createPolicyDecisionFromActionWithConfig,
  type OpenGtmPolicyConfig
} from '@opengtm/policy'
import type { OpenGtmProvider } from '@opengtm/providers'
import type { SkillDisclosure, SkillRegistry, SkillMatchQuery } from '@opengtm/skills'
import type {
  OpenGtmApprovalRequest,
  OpenGtmConnectorContract,
  OpenGtmConnectorSession,
  OpenGtmMemoryType,
  OpenGtmPolicyDecision
} from '@opengtm/types'

export type OpenGtmLoopPhase = 'plan' | 'observe' | 'act' | 'reflect'

export interface OpenGtmLoopLimits {
  maxSteps: number
  maxCostUsd?: number
  maxMillis?: number
}

export interface OpenGtmLoopStep {
  phase: OpenGtmLoopPhase
  prompt: string
  outputText?: string
  costUsd?: number
  promptTokens?: number
  budgetState?: ContextBudgetState
  budgetStatus?: ContextBudgetStatus
  omittedPromptSections?: string[]
  memoryHits?: MemorySearchHit[]
  disclosedSkills?: string[]
  connectorAction?: OpenGtmLoopConnectorAction
  connectorStatus?: 'attempted' | 'executed' | 'skipped-approval' | 'failed'
  connectorResult?: ReturnType<typeof executeConnectorAction>
  policyDecision?: OpenGtmPolicyDecision
  approvalRequest?: OpenGtmApprovalRequest
  error?: OpenGtmLoopFailure
}

export interface OpenGtmLoopResult {
  status: 'completed' | 'stopped' | 'failed'
  reason?: 'step-limit' | 'cost-limit' | 'time-limit'
  steps: OpenGtmLoopStep[]
  totalCostUsd: number
  policyDecisions?: OpenGtmPolicyDecision[]
  approvalRequests?: OpenGtmApprovalRequest[]
  logFilePath?: string
  failure?: OpenGtmLoopFailure
  goalSatisfied?: boolean
  errorCount?: number
  approvalsRequested?: number
  approvalsGranted?: number
  toggles?: OpenGtmLoopSubsystemToggles
}

export interface OpenGtmLoopConnectorAction {
  provider?: string
  family: string
  action: string
  target: string
  payload?: Record<string, unknown>
}

export interface OpenGtmLoopMemoryRuntime {
  manager: MemoryManager
  workspaceId: string
  scope?: string
  memoryType?: OpenGtmMemoryType
  queryText?: string
  limit?: number
  autoStoreOutputs?: boolean
}

export interface OpenGtmLoopSkillsRuntime {
  registry: SkillRegistry
  disclosure?: SkillDisclosure
  limit?: number
  query?: Omit<SkillMatchQuery, 'intent' | 'limit'>
}

export interface OpenGtmLoopConnectorsRuntime {
  bundle: OpenGtmConnectorContract[]
  sessions?: OpenGtmConnectorSession[]
  parser?: (outputText: string) => OpenGtmLoopConnectorAction | null
}

export interface OpenGtmLoopPolicyRuntime {
  workItemId: string
  workspaceId: string
  lane: string
  config?: OpenGtmPolicyConfig
  createDecision?: (input: {
    action: OpenGtmLoopConnectorAction
    connectorFamily: string
    actionType: string
  }) => OpenGtmPolicyDecision
  createApprovalRequest?: (input: {
    action: OpenGtmLoopConnectorAction
    decision: OpenGtmPolicyDecision
  }) => OpenGtmApprovalRequest
}

export interface OpenGtmLoopObservabilityRuntime {
  logger: Pick<JsonlRunLogger, 'log' | 'finalize' | 'logFilePath'>
}

export interface OpenGtmLoopRuntime {
  workingContext?: WorkingContext
  memory?: OpenGtmLoopMemoryRuntime
  skills?: OpenGtmLoopSkillsRuntime
  connectors?: OpenGtmLoopConnectorsRuntime
  policy?: OpenGtmLoopPolicyRuntime
  observability?: OpenGtmLoopObservabilityRuntime
  contextBudget?: ContextBudget
  toggles?: Partial<OpenGtmLoopSubsystemToggles>
}

export interface OpenGtmLoopFailure {
  phase: OpenGtmLoopPhase
  kind: 'provider' | 'parser' | 'connector' | 'runtime'
  message: string
}

export interface OpenGtmLoopSubsystemToggles {
  memoryRetrieval: boolean
  skillLoading: boolean
  policyGating: boolean
  subagents: boolean
  compaction: boolean
}

export async function runGovernedLoop({
  provider,
  goal,
  limits,
  runtime
}: {
  provider: OpenGtmProvider
  goal: string
  limits: OpenGtmLoopLimits
  runtime?: OpenGtmLoopRuntime
}): Promise<OpenGtmLoopResult> {
  const startedAt = Date.now()
  const steps: OpenGtmLoopStep[] = []
  const policyDecisions: OpenGtmPolicyDecision[] = []
  const approvalRequests: OpenGtmApprovalRequest[] = []
  let totalCostUsd = 0
  const toggles = resolveRuntimeToggles(runtime)

  const phases: OpenGtmLoopPhase[] = ['plan', 'observe', 'act', 'reflect']
  emitRuntimeEvent(runtime, 'run.start', {
    goal,
    limits,
    startedAt: new Date(startedAt).toISOString()
  })

  for (let i = 0; i < limits.maxSteps; i++) {
    const phase = phases[i % phases.length]
    if (limits.maxMillis && Date.now() - startedAt > limits.maxMillis) {
      return finalizeLoopResult(runtime, {
        status: 'stopped',
        reason: 'time-limit',
        steps,
        totalCostUsd,
        policyDecisions,
        approvalRequests,
        toggles
      })
    }
    if (limits.maxCostUsd !== undefined && totalCostUsd >= limits.maxCostUsd) {
      return finalizeLoopResult(runtime, {
        status: 'stopped',
        reason: 'cost-limit',
        steps,
        totalCostUsd,
        policyDecisions,
        approvalRequests,
        toggles
      })
    }

    emitRuntimeEvent(runtime, 'step.started', {
      index: i,
      phase,
      goal
    })
    let promptContext: Awaited<ReturnType<typeof buildIntegratedPrompt>> | null = null
    let prompt = `[${phase}] ${goal}`
    let outputText: string | undefined
    let costUsd = 0
    let connectorAction: OpenGtmLoopConnectorAction | null = null
    let connectorStatus: OpenGtmLoopStep['connectorStatus']
    let connectorResult: ReturnType<typeof executeConnectorAction> | undefined
    let policyDecision: OpenGtmPolicyDecision | undefined
    let approvalRequest: OpenGtmApprovalRequest | undefined
    let stepError: OpenGtmLoopFailure | undefined

    try {
      promptContext = runtime && hasIntegratedRuntime(runtime)
        ? await buildIntegratedPrompt({ goal, phase, runtime })
        : null
      prompt = promptContext?.prompt ?? prompt

      const output = await provider.generate({ prompt })
      outputText = output.text
      costUsd = output.costUsd || 0
      totalCostUsd += costUsd

      if (phase === 'act') {
        if (runtime?.connectors?.parser) {
          try {
            connectorAction = runtime.connectors.parser(output.text)
          } catch (error) {
            stepError = createLoopFailure(phase, 'parser', error)
          }
        } else {
          const parsed = parseConnectorActionResult(output.text)
          connectorAction = parsed.action
          if (parsed.error) {
            stepError = {
              phase,
              kind: 'parser',
              message: parsed.error
            }
          }
        }
      }

      if (connectorAction && runtime?.connectors) {
        connectorStatus = 'attempted'
        emitRuntimeEvent(runtime, 'connector.attempted', {
          phase,
          action: connectorAction
        })

        const actionPolicy = runtime.policy
          ? evaluateConnectorActionPolicy(runtime.policy, connectorAction)
          : null

        if (actionPolicy) {
          policyDecision = actionPolicy.policyDecision
          policyDecisions.push(policyDecision)
          emitRuntimeEvent(runtime, 'policy.decision', {
            phase,
            action: connectorAction,
            decision: policyDecision
          })

          if (actionPolicy.approvalRequest) {
            approvalRequest = actionPolicy.approvalRequest
            approvalRequests.push(approvalRequest)
            connectorStatus = 'skipped-approval'
            emitRuntimeEvent(runtime, 'approval.requested', {
              phase,
              action: connectorAction,
              approvalRequest
            })
            emitRuntimeEvent(runtime, 'connector.skipped', {
              phase,
              action: connectorAction,
              reason: 'approval-required',
              decision: policyDecision,
              approvalRequest
            })
          }
        }

        if (connectorStatus !== 'skipped-approval') {
          connectorResult = executeConnectorAction(runtime.connectors.bundle, {
            ...connectorAction,
            session: resolveConnectorSession(runtime.connectors, connectorAction)
          })
          connectorStatus = 'executed'
          emitRuntimeEvent(runtime, 'connector.executed', {
            phase,
            action: connectorAction,
            result: connectorResult
          })
        }
      }
    } catch (error) {
      stepError = createLoopFailure(
        phase,
        connectorAction ? 'connector' : 'provider',
        error
      )
      connectorStatus = connectorAction ? 'failed' : connectorStatus
    }

    const step: OpenGtmLoopStep = {
      phase,
      prompt,
      outputText,
      costUsd,
      promptTokens: promptContext?.promptTokens,
      budgetState: promptContext?.budgetStatus?.state,
      budgetStatus: promptContext?.budgetStatus,
      omittedPromptSections: promptContext?.omittedSections,
      memoryHits: promptContext?.memoryHits,
      disclosedSkills: promptContext?.disclosedSkills,
      connectorAction: connectorAction ?? undefined,
      connectorStatus,
      connectorResult,
      policyDecision,
      approvalRequest,
      error: stepError
    }

    steps.push(step)
    emitRuntimeEvent(runtime, 'step.completed', {
      index: i,
      phase,
      step
    })

    try {
      await externalizeStepRuntime({ runtime, goal, phase, step })
    } catch (error) {
      const runtimeFailure = createLoopFailure(phase, 'runtime', error)
      step.error = runtimeFailure
      return finalizeLoopResult(runtime, {
        status: 'failed',
        steps,
        totalCostUsd,
        policyDecisions,
        approvalRequests,
        failure: runtimeFailure,
        toggles
      })
    }

    if (stepError && stepError.kind !== 'parser') {
      return finalizeLoopResult(runtime, {
        status: 'failed',
        steps,
        totalCostUsd,
        policyDecisions,
        approvalRequests,
        failure: stepError,
        toggles
      })
    }
  }

  return finalizeLoopResult(runtime, {
    status: 'stopped',
    reason: 'step-limit',
    steps,
    totalCostUsd,
    policyDecisions,
    approvalRequests,
    toggles
  })
}

function hasIntegratedRuntime(runtime: OpenGtmLoopRuntime): boolean {
  return Boolean(
    runtime.workingContext ||
    runtime.memory ||
    runtime.skills ||
    runtime.connectors ||
    runtime.policy ||
    runtime.observability ||
    runtime.contextBudget
  )
}

function resolveRuntimeToggles(
  runtime: OpenGtmLoopRuntime | undefined
): OpenGtmLoopSubsystemToggles {
  return {
    memoryRetrieval: runtime?.toggles?.memoryRetrieval ?? Boolean(runtime?.memory),
    skillLoading: runtime?.toggles?.skillLoading ?? Boolean(runtime?.skills),
    policyGating: runtime?.toggles?.policyGating ?? Boolean(runtime?.policy),
    subagents: runtime?.toggles?.subagents ?? false,
    compaction: runtime?.toggles?.compaction ?? false
  }
}

function createLoopFailure(
  phase: OpenGtmLoopPhase,
  kind: OpenGtmLoopFailure['kind'],
  error: unknown
): OpenGtmLoopFailure {
  return {
    phase,
    kind,
    message: error instanceof Error ? error.message : String(error)
  }
}

function evaluateConnectorActionPolicy(
  policy: OpenGtmLoopPolicyRuntime,
  action: OpenGtmLoopConnectorAction
): {
  policyDecision: OpenGtmPolicyDecision
  approvalRequest?: OpenGtmApprovalRequest
} {
  const actionType = action.action
  const connectorFamily = action.family
  const policyDecision = policy.createDecision?.({ action, connectorFamily, actionType })
    ?? (policy.config
      ? createPolicyDecisionFromActionWithConfig({
          workItemId: policy.workItemId,
          lane: policy.lane,
          actionType,
          connectorFamily,
          target: action.target
        }, policy.config)
      : createPolicyDecisionFromAction({
          workItemId: policy.workItemId,
          lane: policy.lane,
          actionType,
          connectorFamily,
          target: action.target
        }))

  const approvalRequest = policyDecision.approvalRequired
    ? (policy.createApprovalRequest?.({ action, decision: policyDecision })
      ?? createApprovalRequestForDecision({
          workspaceId: policy.workspaceId,
          decision: policyDecision,
          actionSummary: formatActionSummary(action)
        }))
    : undefined

  return { policyDecision, approvalRequest }
}

function finalizeLoopResult(
  runtime: OpenGtmLoopRuntime | undefined,
  result: OpenGtmLoopResult
): OpenGtmLoopResult {
  const finalizedResult: OpenGtmLoopResult = {
    ...result,
    logFilePath: runtime?.observability?.logger.logFilePath,
    goalSatisfied: result.goalSatisfied ?? result.status === 'completed',
    errorCount: result.errorCount ?? result.steps.filter((step) => Boolean(step.error)).length,
    approvalsRequested: result.approvalsRequested ?? result.approvalRequests?.length ?? 0,
    approvalsGranted: result.approvalsGranted ?? 0,
    toggles: result.toggles ?? resolveRuntimeToggles(runtime)
  }

  try {
    runtime?.observability?.logger.finalize({
      status: finalizedResult.status,
      reason: finalizedResult.reason,
      steps: finalizedResult.steps.length,
      totalCostUsd: finalizedResult.totalCostUsd,
      policyDecisions: finalizedResult.policyDecisions?.length ?? 0,
      approvalRequests: finalizedResult.approvalRequests?.length ?? 0
    })
  } catch {
    // Logging failures must not hide the loop result from callers.
  }

  return finalizedResult
}

function emitRuntimeEvent(
  runtime: OpenGtmLoopRuntime | undefined,
  eventType: string,
  data?: unknown
): void {
  runtime?.observability?.logger.log(eventType, data)
}

function formatActionSummary(action: OpenGtmLoopConnectorAction): string {
  return `${action.action} ${action.family}:${action.target}`
}

async function buildIntegratedPrompt({
  goal,
  phase,
  runtime
}: {
  goal: string
  phase: OpenGtmLoopPhase
  runtime: OpenGtmLoopRuntime
}): Promise<{
  prompt: string
  promptTokens: number
  budgetStatus?: ContextBudgetStatus
  omittedSections: string[]
  memoryHits: MemorySearchHit[]
  disclosedSkills: string[]
}> {
  const workingContextSection = runtime.workingContext?.toPromptSection() ?? ''
  const memoryHits = runtime.memory
    ? await runtime.memory.manager.search({
        workspaceId: runtime.memory.workspaceId,
        scope: runtime.memory.scope,
        memoryType: runtime.memory.memoryType,
        text: runtime.memory.queryText ?? goal,
        limit: runtime.memory.limit ?? 3
      })
    : []
  const skillMatches = runtime.skills?.registry.match({
    intent: goal,
    limit: runtime.skills.limit ?? 3,
    ...runtime.skills.query
  }) ?? []
  const disclosedSkills = skillMatches.map((match) => match.skillId)

  const sections = [
    {
      key: 'goal',
      required: true,
      content: [
        `[${phase}] ${goal}`,
        'Use the externalized runtime context below. Stay grounded in retrieved memory and disclosed skills.',
        phase === 'act'
          ? 'If you need a connector action, respond with JSON: {"connectorAction":{"family":"crm","action":"call-api","target":"accounts/123","payload":{}},"response":"optional summary"}'
          : 'Respond with concise reasoning for this phase.'
      ].join('\n')
    },
    {
      key: 'working-context',
      required: false,
      content: workingContextSection
    },
    {
      key: 'retrieved-memory',
      required: false,
      content: formatMemoryHits(memoryHits)
    },
    {
      key: 'disclosed-skills',
      required: false,
      content: formatSkillDisclosures(runtime.skills?.registry, disclosedSkills, runtime.skills?.disclosure ?? 'details')
    },
    {
      key: 'connector-guidance',
      required: false,
      content: formatConnectorGuidance(runtime.connectors?.bundle ?? [])
    }
  ]

  const built = applyContextBudget(sections, runtime.contextBudget)
  return {
    prompt: built.prompt,
    promptTokens: runtime.contextBudget?.estimate(built.prompt) ?? 0,
    budgetStatus: built.budgetStatus,
    omittedSections: built.omittedSections,
    memoryHits,
    disclosedSkills
  }
}

function applyContextBudget(
  sections: Array<{ key: string; required: boolean; content: string }>,
  contextBudget?: ContextBudget
): {
  prompt: string
  omittedSections: string[]
  budgetStatus?: ContextBudgetStatus
} {
  const included: string[] = []
  const omittedSections: string[] = []

  for (const section of sections) {
    if (!section.content) continue

    const nextPrompt = included.length > 0
      ? `${included.join('\n\n')}\n\n${section.content}`
      : section.content

    if (!contextBudget) {
      included.push(section.content)
      continue
    }

    if (section.required) {
      included.splice(0, included.length, truncateToBudget(nextPrompt, contextBudget))
      continue
    }

    if (contextBudget.fits(nextPrompt)) {
      included.push(section.content)
    } else {
      omittedSections.push(section.key)
    }
  }

  let prompt = included.join('\n\n')
  let budgetStatus = contextBudget?.check(prompt)

  if (contextBudget && omittedSections.length > 0) {
    const budgetNote = `<context_budget state="${budgetStatus?.state ?? 'ok'}">\nomitted_sections: ${omittedSections.join(', ')}\n</context_budget>`
    const withNote = prompt ? `${prompt}\n\n${budgetNote}` : budgetNote
    if (contextBudget.fits(withNote)) {
      prompt = withNote
      budgetStatus = contextBudget.check(prompt)
    }
  }

  return { prompt, omittedSections, budgetStatus }
}

function truncateToBudget(text: string, contextBudget: ContextBudget): string {
  if (contextBudget.fits(text)) return text

  const maxChars = contextBudget.status(0).maxTokens * 4
  if (maxChars <= 3) return text.slice(0, Math.max(0, maxChars))

  return `${text.slice(0, Math.max(0, maxChars - 3))}...`
}

function formatMemoryHits(hits: MemorySearchHit[]): string {
  if (hits.length === 0) return ''
  return [
    '<retrieved_memory>',
    ...hits.map((hit, index) => {
      const snippet = hit.content.length > 220 ? `${hit.content.slice(0, 217)}...` : hit.content
      return `${index + 1}. scope=${hit.record.scope} type=${hit.record.memoryType} score=${hit.score}\n${snippet}`
    }),
    '</retrieved_memory>'
  ].join('\n')
}

function formatSkillDisclosures(
  registry: SkillRegistry | undefined,
  skillIds: string[],
  disclosure: SkillDisclosure
): string {
  if (!registry || skillIds.length === 0) return ''

  const disclosures = skillIds
    .map((id) => registry.disclose(id, disclosure))
    .filter((value): value is string => Boolean(value))

  if (disclosures.length === 0) return ''
  return `<relevant_skills>\n${disclosures.join('\n\n---\n\n')}\n</relevant_skills>`
}

function formatConnectorGuidance(bundle: OpenGtmConnectorContract[]): string {
  if (bundle.length === 0) return ''

  return [
    '<connector_guidance>',
    ...bundle.map((contract) => {
      const actions = [...contract.readActions, ...contract.writeActions].join(', ')
      const capabilities = contract.capabilities.join(', ')
      return `${contract.provider} (${contract.family})\nactions: ${actions}\ncapabilities: ${capabilities}`
    }),
    '</connector_guidance>'
  ].join('\n')
}

function parseConnectorAction(outputText: string): OpenGtmLoopConnectorAction | null {
  return parseConnectorActionResult(outputText).action
}

function parseConnectorActionResult(outputText: string): {
  action: OpenGtmLoopConnectorAction | null
  error?: string
} {
  let parseError = false

  for (const candidate of extractJsonCandidates(outputText)) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      const action = toConnectorAction(parsed)
      if (action) {
        return { action }
      }
      parseError = true
    } catch {
      parseError = true
    }
  }

  return parseError
    ? { action: null, error: 'Act phase produced JSON-like output, but no valid connector action could be parsed.' }
    : { action: null }
}

function extractJsonCandidates(outputText: string): string[] {
  const trimmed = outputText.trim()
  const candidates = [trimmed]
  const fencedMatches = outputText.match(/```json\s*([\s\S]*?)```/gi) ?? []

  for (const block of fencedMatches) {
    const candidate = block.replace(/```json\s*/i, '').replace(/```$/, '').trim()
    if (candidate) candidates.push(candidate)
  }

  return candidates
}

function toConnectorAction(parsed: Record<string, unknown>): OpenGtmLoopConnectorAction | null {
  const raw = isRecord(parsed.connectorAction) ? parsed.connectorAction : parsed
  if (!isRecord(raw)) return null
  if (typeof raw.family !== 'string' || typeof raw.action !== 'string' || typeof raw.target !== 'string') {
    return null
  }

  return {
    provider: typeof raw.provider === 'string' ? raw.provider : undefined,
    family: raw.family,
    action: raw.action,
    target: raw.target,
    payload: isRecord(raw.payload) ? raw.payload : {}
  }
}

function resolveConnectorSession(
  connectors: OpenGtmLoopConnectorsRuntime,
  action: OpenGtmLoopConnectorAction
): OpenGtmConnectorSession | null {
  const contract = findConnectorContract(connectors.bundle, {
    provider: action.provider,
    family: action.family
  })
  if (!contract) return null

  return connectors.sessions?.find((session) => {
    return session.provider === contract.provider && session.family === contract.family
  }) ?? null
}

async function externalizeStepRuntime({
  runtime,
  goal,
  phase,
  step
}: {
  runtime?: OpenGtmLoopRuntime
  goal: string
  phase: OpenGtmLoopPhase
  step: OpenGtmLoopStep
}): Promise<void> {
  if (!runtime) return

  if (runtime.workingContext) {
    if (step.outputText) {
      runtime.workingContext.set(`last_${phase}_output`, step.outputText)
    }
    if (step.connectorResult) {
      runtime.workingContext.set('last_connector_action', JSON.stringify(step.connectorAction ?? {}))
      runtime.workingContext.set('last_connector_result', JSON.stringify(step.connectorResult.data))
    }
    if (step.policyDecision) {
      runtime.workingContext.set('last_policy_decision', JSON.stringify(step.policyDecision))
    }
    if (step.approvalRequest) {
      runtime.workingContext.set('last_approval_request', JSON.stringify(step.approvalRequest))
    }
  }

  if (runtime.memory && runtime.memory.autoStoreOutputs !== false) {
    const lines = [
      `goal: ${goal}`,
      `phase: ${phase}`,
      step.outputText ? `output: ${step.outputText}` : '',
      step.connectorResult ? `connector: ${JSON.stringify(step.connectorResult)}` : '',
      step.policyDecision ? `policy: ${JSON.stringify(step.policyDecision)}` : '',
      step.approvalRequest ? `approval: ${JSON.stringify(step.approvalRequest)}` : ''
    ].filter(Boolean)

    if (lines.length > 0) {
      await runtime.memory.manager.write({
        workspaceId: runtime.memory.workspaceId,
        scope: runtime.memory.scope ?? 'loop',
        memoryType: runtime.memory.memoryType ?? 'episodic',
        content: lines.join('\n'),
        retrievalHints: [goal, phase]
      })
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
