export type OpenGtmSessionSpecialist =
  | 'supervisor'
  | 'researcher'
  | 'drafter'
  | 'policy-checker'
  | 'account-health-analyst'
  | 'deal-risk-analyst'

export type OpenGtmSessionIntentKind =
  | 'help'
  | 'research-account'
  | 'draft-outreach'
  | 'account-health'
  | 'account-brief'
  | 'deal-risk'
  | 'expansion-signal'
  | 'renewal-prep'
  | 'usage-analytics'
  | 'inbound-triage'
  | 'outreach-sequence'
  | 'workflow-catalog'
  | 'show-approvals'
  | 'show-traces'
  | 'show-memory'
  | 'show-artifacts'
  | 'show-skills'
  | 'show-agents'
  | 'show-sandbox'
  | 'show-status'
  | 'show-session'
  | 'show-history'
  | 'learn-review'
  | 'explain-block'
  | 'entity-summary'
  | 'pending-summary'
  | 'latest-summary'
  | 'next-summary'
  | 'run-next'
  | 'resume-advance'
  | 'resume-last-task'
  | 'canonical-roundtrip'
  | 'approve-latest'
  | 'deny-latest'
  | 'unknown'

export interface OpenGtmSessionContext {
  focusEntity?: string | null
  lastWorkflowId?: string | null
  lastTraceId?: string | null
  lastApprovalRequestId?: string | null
}

export interface OpenGtmSessionIntent {
  kind: OpenGtmSessionIntentKind
  specialist: OpenGtmSessionSpecialist
  confidence: 'high' | 'medium' | 'low'
  reason: string
  entity: string | null
}

export function parseSessionIntent(input: string, session: OpenGtmSessionContext = {}): OpenGtmSessionIntent {
  const trimmed = input.trim()
  const lower = trimmed.toLowerCase()
  const normalizedLower = lower.startsWith('/') ? lower.slice(1) : lower
  const focusEntity = session.focusEntity || null

  if (lower === '/help' || normalizedLower === 'help' || lower === '?') {
    return makeIntent('help', 'supervisor', 'high', 'operator asked for harness help', null)
  }

  const directLookup = [
    { matches: ['show approvals', 'approvals', "what's pending", 'what is pending', 'pending'], kind: 'pending-summary' as const, specialist: 'policy-checker' as const, reason: 'operator asked for pending approvals or blocked work' },
    { matches: ['show traces', 'show runs'], kind: 'show-traces' as const, specialist: 'supervisor' as const, reason: 'operator asked for recent run traces' },
    { matches: ['show memory'], kind: 'show-memory' as const, specialist: 'supervisor' as const, reason: 'operator asked for harness memory state' },
    { matches: ['show artifacts'], kind: 'show-artifacts' as const, specialist: 'supervisor' as const, reason: 'operator asked for recent artifacts' },
    { matches: ['show workflows', 'workflows'], kind: 'workflow-catalog' as const, specialist: 'supervisor' as const, reason: 'operator asked for available workflows' },
    { matches: ['show sandbox'], kind: 'show-sandbox' as const, specialist: 'policy-checker' as const, reason: 'operator asked for governance/sandbox status' },
    { matches: ['show status'], kind: 'show-status' as const, specialist: 'supervisor' as const, reason: 'operator asked for overall harness status' },
    { matches: ['show session'], kind: 'show-session' as const, specialist: 'supervisor' as const, reason: 'operator asked for session status' },
    { matches: ['show history', 'show transcript'], kind: 'show-history' as const, specialist: 'supervisor' as const, reason: 'operator asked for session transcript' },
    { matches: ['show skills'], kind: 'show-skills' as const, specialist: 'supervisor' as const, reason: 'operator asked for skill catalog' },
    { matches: ['show agents'], kind: 'show-agents' as const, specialist: 'supervisor' as const, reason: 'operator asked for agent catalog' },
    { matches: ['learn review', 'turn this into a skill', 'learn from this'], kind: 'learn-review' as const, specialist: 'supervisor' as const, reason: 'operator asked to derive reviewed learning from prior runs' },
    { matches: ['what happened last', 'show latest', 'latest status'], kind: 'latest-summary' as const, specialist: 'supervisor' as const, reason: 'operator asked for the latest harness outcome' },
    { matches: ['what should i do next', 'what do i do next', 'what next', 'next step', 'next action', 'next'], kind: 'next-summary' as const, specialist: 'supervisor' as const, reason: 'operator asked the runtime to recommend the next GTM action' },
    { matches: ['do the next thing', 'run the next thing', 'execute the next thing', 'do next', 'run next', 'run-next'], kind: 'run-next' as const, specialist: 'supervisor' as const, reason: 'operator asked the runtime to execute the top recommended GTM action' },
    { matches: ['resume runtime', 'resume advance', 'resume autopilot'], kind: 'resume-advance' as const, specialist: 'supervisor' as const, reason: 'operator asked the runtime to resume the last bounded advance run' },
    { matches: ['resume last task'], kind: 'resume-last-task' as const, specialist: 'supervisor' as const, reason: 'operator asked to resume the most recent GTM task' }
  ]

  for (const item of directLookup) {
    if (item.matches.some((match) => normalizedLower === match || normalizedLower.includes(match))) {
      return makeIntent(item.kind, item.specialist, 'high', item.reason, focusEntity)
    }
  }

  if (normalizedLower.includes('why was this blocked') || normalizedLower.includes('why was it blocked') || normalizedLower.includes('why blocked')) {
    return makeIntent('explain-block', 'policy-checker', 'high', 'operator asked for the block reason behind the latest gated or failed task', focusEntity)
  }

  if (normalizedLower.startsWith('approve')) {
    return makeIntent('approve-latest', 'policy-checker', 'medium', 'operator wants to approve the latest pending approval', focusEntity)
  }

  if (normalizedLower.startsWith('deny')) {
    return makeIntent('deny-latest', 'policy-checker', 'medium', 'operator wants to deny the latest pending approval', focusEntity)
  }

  if (normalizedLower.includes('what do you know about this account') || normalizedLower.includes('what do you know about this lead') || normalizedLower.includes('what do you know about this contact') || normalizedLower.includes('what do you know about this deal') || normalizedLower.includes('what do you know about this opportunity')) {
    return makeIntent('entity-summary', 'researcher', focusEntity ? 'high' : 'low', focusEntity ? 'operator asked for a summary of the active focus entity' : 'operator asked for an entity summary but no focus entity is set yet', focusEntity)
  }

  const knowledgeMatch = trimmed.match(/what do you know about (.+)/i)
  if (knowledgeMatch) {
    return makeIntent('entity-summary', 'researcher', 'high', 'operator asked for a focused GTM summary about an entity', normalizeEntity(knowledgeMatch[1], focusEntity))
  }

  const researchMatch = trimmed.match(/^(research|investigate|look into|find)\s+(.+)$/i)
  if (researchMatch) {
    const entity = normalizeEntity(researchMatch[2], focusEntity)
    return makeIntent('research-account', 'researcher', entity ? 'high' : 'medium', 'research-oriented GTM task routed to the researcher specialist', entity)
  }

  const accountHealthMatch = trimmed.match(/^(check|show|assess)\s+(account health|health score)(?:\s+for)?\s*(.*)$/i)
  if (accountHealthMatch) {
    return makeIntent('account-health', 'account-health-analyst', 'high', 'account-health request routed to the customer/account health specialist', normalizeEntity(accountHealthMatch[3], focusEntity))
  }

  const accountBriefMatch = trimmed.match(/^(show|generate|create|prepare|brief)\s+(account brief|brief)(?:\s+for| me on)?\s*(.*)$/i)
  if (accountBriefMatch) {
    return makeIntent('account-brief', 'researcher', 'high', 'account brief request routed to the account researcher specialist', normalizeEntity(accountBriefMatch[3], focusEntity))
  }

  const dealRiskMatch = trimmed.match(/^(check|scan|show|assess)\s+(deal risk|risk)(?:\s+for)?\s*(.*)$/i)
  if (dealRiskMatch) {
    return makeIntent('deal-risk', 'deal-risk-analyst', 'high', 'deal-risk request routed to the deal-risk specialist', normalizeEntity(dealRiskMatch[3], focusEntity))
  }

  const expansionMatch = trimmed.match(/^(find|check|show)\s+(expansion signal|expansion signals|expansion opportunity|expansion opportunities)(?:\s+for)?\s*(.*)$/i)
  if (expansionMatch) {
    return makeIntent('expansion-signal', 'account-health-analyst', 'high', 'expansion-signal request routed to the account specialist', normalizeEntity(expansionMatch[3], focusEntity))
  }

  const renewalMatch = trimmed.match(/^(prep|prepare|show)\s+(renewal|renewal prep)(?:\s+for)?\s*(.*)$/i)
  if (renewalMatch) {
    return makeIntent('renewal-prep', 'account-health-analyst', 'high', 'renewal-prep request routed to the account specialist', normalizeEntity(renewalMatch[3], focusEntity))
  }

  const usageMatch = trimmed.match(/^(show|check|analyze)\s+(usage analytics|usage|product usage)(?:\s+for)?\s*(.*)$/i)
  if (usageMatch) {
    return makeIntent('usage-analytics', 'researcher', 'medium', 'usage analytics request routed to the analytics/insight specialist', normalizeEntity(usageMatch[3], focusEntity))
  }

  const draftMatch = trimmed.match(/^(draft|write|compose)\s+(outreach|email|message)(?:\s+for)?\s*(.*)$/i)
  if (draftMatch) {
    const entity = normalizeEntity(draftMatch[3], focusEntity)
    return makeIntent('draft-outreach', 'drafter', entity ? 'high' : 'medium', 'draft-oriented GTM task routed to the drafting specialist', entity)
  }

  const sequenceMatch = trimmed.match(/^(build|draft|plan|show)\s+(outreach sequence|sequence)(?:\s+for)?\s*(.*)$/i)
  if (sequenceMatch) {
    return makeIntent('outreach-sequence', 'drafter', 'medium', 'sequence-oriented GTM task routed to the drafter specialist', normalizeEntity(sequenceMatch[3], focusEntity))
  }

  const inboundMatch = trimmed.match(/^(triage|check|show)\s+(inbound|inbound triage)(?:\s+for)?\s*(.*)$/i)
  if (inboundMatch) {
    return makeIntent('inbound-triage', 'policy-checker', 'medium', 'inbound triage request routed to the policy/triage specialist', normalizeEntity(inboundMatch[3], focusEntity))
  }

  if (normalizedLower.includes('roundtrip') || normalizedLower.includes('canonical workflow')) {
    return makeIntent('canonical-roundtrip', 'supervisor', 'medium', 'operator explicitly referenced the canonical GTM roundtrip path', focusEntity)
  }

  return makeIntent('unknown', 'supervisor', 'low', 'no strong GTM intent matched the current input', focusEntity)
}

function makeIntent(
  kind: OpenGtmSessionIntentKind,
  specialist: OpenGtmSessionSpecialist,
  confidence: 'high' | 'medium' | 'low',
  reason: string,
  entity: string | null
): OpenGtmSessionIntent {
  return { kind, specialist, confidence, reason, entity }
}

function normalizeEntity(value: string | undefined, fallback: string | null) {
  const trimmed = (value || '').trim()
  if (!trimmed) return fallback
  return trimmed.replace(/^for\s+/i, '').trim() || fallback
}
