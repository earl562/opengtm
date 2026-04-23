import { getReferenceWorkflow } from './workflows.js'
import { parseSessionIntent, type OpenGtmSessionIntent, type OpenGtmSessionContext } from './session-intents.js'

export type OpenGtmSessionPlanStepType = 'workflow' | 'query' | 'command' | 'help' | 'unknown'

export interface OpenGtmSessionPlanStep {
  id: string
  type: OpenGtmSessionPlanStepType
  intent: OpenGtmSessionIntent
  label: string
  supportTier: string
  commandArgs: string[]
}

export interface OpenGtmSessionPlan {
  objective: string
  entity: string | null
  confidence: 'high' | 'medium' | 'low'
  steps: OpenGtmSessionPlanStep[]
  rationale: string[]
}

export function createSessionPlan(input: string, session: OpenGtmSessionContext = {}): OpenGtmSessionPlan {
  const clauses = splitTaskClauses(input)
  const intents = clauses.map((clause) => parseSessionIntent(clause, session))
  const entity = intents.find((intent) => intent.entity)?.entity || session.focusEntity || null
  const steps = intents.map((intent, index) =>
    planStepForIntent(
      intent,
      index,
      entity,
      input,
      session.lastWorkflowId || null,
      session.lastApprovalRequestId || null
    )
  )
  const confidence = derivePlanConfidence(intents)

  return {
    objective: input.trim(),
    entity,
    confidence,
    steps,
    rationale: [
      `supervisor confidence: ${confidence}`,
      ...steps.map((step) => `${step.id}: ${step.intent.specialist} -> ${step.label} (${step.supportTier}) because ${step.intent.reason}`)
    ]
  }
}

function splitTaskClauses(input: string) {
  return input
    .split(/\s+\band\b\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

function planStepForIntent(
  intent: OpenGtmSessionIntent,
  index: number,
  sharedEntity: string | null,
  originalInput: string,
  lastWorkflowId: string | null,
  lastApprovalRequestId: string | null
): OpenGtmSessionPlanStep {
  const entity = intent.entity || sharedEntity
  const id = `step-${index + 1}`

  if (intent.kind === 'help') {
    return { id, type: 'help', intent, label: 'Show harness help', supportTier: 'live', commandArgs: [] }
  }

  if (intent.kind === 'entity-summary') {
    return { id, type: 'query', intent: { ...intent, entity }, label: `Summarize GTM context for ${entity || 'latest active focus'}`, supportTier: 'live', commandArgs: ['session', 'summary'] }
  }
  if (intent.kind === 'pending-summary') {
    return { id, type: 'query', intent, label: 'Summarize pending approvals and blocked work', supportTier: 'live', commandArgs: ['approvals', 'list'] }
  }
  if (intent.kind === 'latest-summary') {
    return { id, type: 'query', intent, label: 'Summarize the latest harness outcome', supportTier: 'live', commandArgs: ['session', 'summary'] }
  }
  if (intent.kind === 'next-summary') {
    return { id, type: 'query', intent, label: 'Recommend the next GTM action from the current runtime state', supportTier: 'live', commandArgs: ['session', 'runtime'] }
  }
  if (intent.kind === 'run-next') {
    return { id, type: 'command', intent, label: 'Execute the top runtime action card', supportTier: 'live', commandArgs: ['session', 'do'] }
  }
  if (intent.kind === 'resume-advance') {
    return { id, type: 'command', intent, label: 'Resume the last bounded runtime advance run', supportTier: 'live', commandArgs: ['session', 'resume'] }
  }
  if (intent.kind === 'explain-block') {
    return { id, type: 'query', intent, label: 'Explain the latest blocked or approval-gated workflow', supportTier: 'live', commandArgs: ['approvals', 'list'] }
  }

  const commandMap: Partial<Record<OpenGtmSessionIntent['kind'], string[]>> = {
    'show-traces': ['traces', 'list'],
    'show-memory': ['memory', 'list'],
    'show-artifacts': ['artifacts', 'list'],
    'workflow-catalog': ['workflow', 'list'],
    'show-sandbox': ['sandbox', 'status'],
    'show-status': ['status'],
    'show-session': ['session', 'status'],
    'show-history': ['session', 'transcript'],
    'show-skills': ['skill', 'list'],
    'show-agents': ['agent', 'list'],
    'learn-review': ['learn', 'review']
  }

  const commandArgs = commandMap[intent.kind]
  if (commandArgs) {
    return { id, type: 'command', intent, label: `Run ${commandArgs.join(' ')}`, supportTier: 'live', commandArgs }
  }

  if (intent.kind === 'approve-latest' || intent.kind === 'deny-latest') {
    return {
      id,
      type: 'command',
      intent,
      label: `${intent.kind === 'approve-latest' ? 'Approve' : 'Deny'} the latest pending approval`,
      supportTier: 'live',
      commandArgs: lastApprovalRequestId
        ? ['approvals', intent.kind === 'approve-latest' ? 'approve' : 'deny', lastApprovalRequestId]
        : ['approvals', 'list']
    }
  }

  const workflowMap: Partial<Record<OpenGtmSessionIntent['kind'], string>> = {
    'research-account': 'sdr.lead_research',
    'draft-outreach': 'sdr.outreach_compose',
    'outreach-sequence': 'sdr.outreach_sequence',
    'inbound-triage': 'sdr.inbound_triage',
    'account-health': 'cs.health_score',
    'account-brief': 'ae.account_brief',
    'deal-risk': 'ae.deal_risk_scan',
    'expansion-signal': 'ae.expansion_signal',
    'renewal-prep': 'cs.renewal_prep',
    'usage-analytics': 'de.usage_analytics',
    'canonical-roundtrip': 'crm.roundtrip',
    'resume-last-task': lastWorkflowId || undefined
  }

  const workflowId = workflowMap[intent.kind]
  if (workflowId) {
    const workflow = getReferenceWorkflow(workflowId)
    const goal = entity
      ? workflowId === 'crm.roundtrip'
        ? `${entity}`
        : `${workflow?.name || originalInput} for ${entity}`
      : originalInput
    return {
      id,
      type: 'workflow',
      intent: { ...intent, entity },
      label: `Run workflow ${workflowId}${entity ? ` for ${entity}` : ''}`,
      supportTier: workflow?.supportTier || 'unknown',
      commandArgs: ['workflow', 'run', workflowId, goal]
    }
  }

  return {
    id,
    type: 'unknown',
    intent,
    label: 'Unknown GTM action',
    supportTier: 'unknown',
    commandArgs: []
  }
}

function derivePlanConfidence(intents: OpenGtmSessionIntent[]) {
  if (intents.some((intent) => intent.confidence === 'low')) return 'low'
  if (intents.some((intent) => intent.confidence === 'medium')) return 'medium'
  return 'high'
}
