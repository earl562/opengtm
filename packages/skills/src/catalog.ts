import { fileURLToPath } from 'node:url'
import { makeSkillArtifact } from './manifest-v2.js'
import type { SkillArtifact, SkillManifest } from './types.js'

const GTM_SKILLS: SkillManifest[] = [
  {
    id: 'lead_research',
    name: 'Lead Research',
    version: '1.0.0',
    persona: 'SDR',
    summary:
      'Gather firmographic, technographic, and persona-level signals for a new inbound or outbound lead before any outreach.',
    triggers: [
      { type: 'event', match: 'crm.lead.created' },
      { type: 'intent', match: 'research this lead' }
    ],
    preconditions: [
      'lead record exists with at least company domain OR contact email',
      'workspace has crm + web_research connectors bound'
    ],
    steps: [
      { id: 'fetch-crm', description: 'Pull canonical lead + account record from CRM' },
      { id: 'enrich', description: 'Call enrichment connector(s) for firmographics' },
      { id: 'web-search', description: 'Run targeted web search for recent signals (funding, launches, hires)' },
      { id: 'meeting-intel', description: 'Check meeting-intelligence store for prior calls' },
      { id: 'compose-brief', description: 'Write structured research brief to artifact' }
    ],
    antiPatterns: [
      'do not send outreach from this skill',
      'do not fabricate facts not supported by retrieved evidence',
      'do not exceed research budget limit without approval'
    ],
    validations: [
      'artifact exists at expected path',
      'every claim in brief has a source citation',
      'persona section names the buyer role'
    ],
    requiredConnectors: [
      { family: 'crm', capability: 'lead.read' },
      { family: 'enrichment', capability: 'account.enrich' },
      { family: 'web_research', capability: 'search' }
    ],
    tags: ['sdr', 'research', 'inbound', 'outbound'],
    composition: 'serial'
  },
  {
    id: 'outreach_compose',
    name: 'Outreach Compose',
    version: '1.0.0',
    persona: 'SDR',
    summary:
      'Draft a first-touch personalized outreach message grounded in prior research. Always routes to human approval before send.',
    triggers: [
      { type: 'intent', match: 'draft outreach' },
      { type: 'event', match: 'lead.research.complete' }
    ],
    preconditions: [
      'research brief artifact exists for the lead',
      'rep style-memory has been consulted'
    ],
    steps: [
      { id: 'load-brief', description: 'Load research brief for lead' },
      { id: 'load-style', description: 'Load rep-level style memory' },
      { id: 'pick-angle', description: 'Select single strongest angle from brief' },
      { id: 'draft', description: 'Write message body + subject' },
      { id: 'approval', description: 'Emit approval request with Send/Edit/Cancel' }
    ],
    antiPatterns: [
      'never send without human approval',
      'no multi-paragraph messages on cold first touch',
      'do not reference private internal notes'
    ],
    validations: [
      'word count within configured band',
      'includes exactly one CTA',
      'does not violate do-not-send list'
    ],
    requiredConnectors: [
      { family: 'email', capability: 'draft' },
      { family: 'comms', capability: 'approval' }
    ],
    tags: ['sdr', 'outbound', 'email', 'hitl'],
    composition: 'serial'
  },
  {
    id: 'outreach_sequence',
    name: 'Outreach Sequence',
    version: '1.0.0',
    persona: 'SDR',
    summary:
      'Enroll a lead into a multi-touch sequence with variable-depth follow-ups; each touch gated by the reply state from the previous.',
    triggers: [
      { type: 'event', match: 'outreach.sent' },
      { type: 'schedule', match: 'sequence.tick' }
    ],
    preconditions: [
      'initial outreach has been sent and logged',
      'sequence policy approved for persona + segment'
    ],
    steps: [
      { id: 'evaluate-reply', description: 'Check whether prior touch produced a reply' },
      { id: 'select-next', description: 'Choose next touch template per reply state' },
      { id: 'schedule', description: 'Schedule next touch respecting SLA windows' },
      { id: 'hand-off', description: 'Escalate to human if policy violation detected' }
    ],
    antiPatterns: [
      'do not repeat prior touch content verbatim',
      'do not exceed configured sequence depth without approval'
    ],
    validations: [
      'touch separation respects configured min/max',
      'no channel hopping without rep-approved rule'
    ],
    requiredConnectors: [
      { family: 'email', capability: 'schedule' },
      { family: 'crm', capability: 'activity.log' }
    ],
    tags: ['sdr', 'outbound', 'sequence'],
    composition: 'conditional'
  },
  {
    id: 'inbound_triage',
    name: 'Inbound Triage',
    version: '1.0.0',
    persona: 'SDR',
    summary:
      'Classify an inbound lead as tier-1/2/3, route to correct owner, and auto-skip do-not-send list checks before any engagement.',
    triggers: [
      { type: 'event', match: 'form.submitted' },
      { type: 'event', match: 'inbox.message.received' }
    ],
    preconditions: [
      'ICP scoring rules loaded',
      'do-not-send list loaded'
    ],
    steps: [
      { id: 'dns-check', description: 'Verify lead is not on do-not-send list' },
      { id: 'score', description: 'Apply ICP scoring rules' },
      { id: 'route', description: 'Assign owner and SLA' },
      { id: 'notify', description: 'Post to owner channel if tier-1' }
    ],
    antiPatterns: [
      'no engagement before do-not-send check',
      'no tier-1 routing without ICP score >= threshold'
    ],
    validations: [
      'owner exists and is active',
      'SLA configured for tier'
    ],
    requiredConnectors: [
      { family: 'crm', capability: 'lead.read' },
      { family: 'comms', capability: 'notify' }
    ],
    tags: ['sdr', 'inbound', 'routing'],
    composition: 'serial'
  },
  {
    id: 'account_brief',
    name: 'Account Brief',
    version: '1.0.0',
    persona: 'AE',
    summary:
      'Weekly structured brief per active account: deal state, open tasks, exec changes, product usage deltas, competitive noise.',
    triggers: [
      { type: 'schedule', match: 'weekly.account.tick' },
      { type: 'intent', match: 'brief me on this account' }
    ],
    preconditions: [
      'account record exists',
      'warehouse + crm + meeting-intel connectors bound'
    ],
    steps: [
      { id: 'deal-state', description: 'Pull open deals + stage changes since last brief' },
      { id: 'usage', description: 'Query warehouse for product usage deltas' },
      { id: 'exec-scan', description: 'Detect exec LinkedIn changes' },
      { id: 'assemble', description: 'Write structured brief artifact' }
    ],
    antiPatterns: [
      'do not summarize private legal counsel notes',
      'do not assert revenue impact without sourced numbers'
    ],
    validations: [
      'brief references at most 14 days of activity',
      'every numeric claim sourced to warehouse query'
    ],
    requiredConnectors: [
      { family: 'crm', capability: 'account.read' },
      { family: 'warehouse', capability: 'query' },
      { family: 'meeting_intelligence', capability: 'transcripts.read' }
    ],
    tags: ['ae', 'account', 'weekly'],
    composition: 'parallel'
  },
  {
    id: 'deal_risk_scan',
    name: 'Deal Risk Scan',
    version: '1.0.0',
    persona: 'AE',
    summary:
      'Compute risk signals on open late-stage deals: champion silent, MEDDPICC gaps, competitor sighting, stalled stage.',
    triggers: [
      { type: 'schedule', match: 'daily.pipeline.tick' },
      { type: 'intent', match: 'check deal risk' }
    ],
    preconditions: [
      'deals in stage >= Proposal exist',
      'MEDDPICC schema populated on deals'
    ],
    steps: [
      { id: 'load-deals', description: 'List open late-stage deals' },
      { id: 'champion-silence', description: 'Detect champion-no-response > SLA' },
      { id: 'meddpicc-gaps', description: 'Identify unfilled MEDDPICC fields' },
      { id: 'competitor', description: 'Scan transcripts for competitor mentions' },
      { id: 'score', description: 'Compute composite risk score + reasons' }
    ],
    antiPatterns: [
      'do not flag low-risk deals',
      'never downgrade risk without rep confirmation'
    ],
    validations: [
      'every risk includes reason + evidence',
      'no duplicate risks per deal'
    ],
    requiredConnectors: [
      { family: 'crm', capability: 'deal.read' },
      { family: 'meeting_intelligence', capability: 'transcripts.read' }
    ],
    tags: ['ae', 'deal', 'risk'],
    composition: 'parallel'
  },
  {
    id: 'expansion_signal',
    name: 'Expansion Signal',
    version: '1.0.0',
    persona: 'AE',
    summary:
      'Detect expansion opportunities: new user growth, feature adoption, multi-team usage, hiring signals.',
    triggers: [
      { type: 'schedule', match: 'weekly.expansion.tick' },
      { type: 'event', match: 'warehouse.usage.spike' }
    ],
    preconditions: [
      'customer account in good standing',
      'usage telemetry available'
    ],
    steps: [
      { id: 'usage-delta', description: 'Compute feature & user growth' },
      { id: 'team-spread', description: 'Detect users in new teams/departments' },
      { id: 'hiring', description: 'Check hiring signals' },
      { id: 'propose-play', description: 'Propose expansion play' }
    ],
    antiPatterns: [
      'no expansion outreach during renewal window without CS approval'
    ],
    validations: [
      'at least one signal ranks above noise threshold'
    ],
    requiredConnectors: [
      { family: 'warehouse', capability: 'query' },
      { family: 'web_research', capability: 'search' }
    ],
    tags: ['ae', 'expansion'],
    composition: 'serial'
  },
  {
    id: 'competitive_intel',
    name: 'Competitive Intel',
    version: '1.0.0',
    persona: 'AE',
    summary:
      'Summarize competitor mentions across calls, inbox, and web for a target account in the last N days.',
    triggers: [
      { type: 'intent', match: 'what are competitors doing' }
    ],
    preconditions: [
      'competitor list configured at workspace'
    ],
    steps: [
      { id: 'scan-calls', description: 'Search transcripts' },
      { id: 'scan-inbox', description: 'Search inbox threads' },
      { id: 'scan-web', description: 'Web search for recent moves' },
      { id: 'summarize', description: 'Write competitive brief artifact' }
    ],
    antiPatterns: [
      'do not disparage competitors in outward artifacts'
    ],
    validations: [
      'sources cited per claim'
    ],
    requiredConnectors: [
      { family: 'meeting_intelligence', capability: 'transcripts.read' },
      { family: 'web_research', capability: 'search' }
    ],
    tags: ['ae', 'competitive'],
    composition: 'parallel'
  },
  {
    id: 'call_prep',
    name: 'Call Prep',
    version: '1.0.0',
    persona: 'AE',
    summary:
      'One-page brief before a customer call: attendees, agenda, last-call recap, open tasks, relevant product usage.',
    triggers: [
      { type: 'schedule', match: 'meeting.t_minus_60' }
    ],
    preconditions: [
      'meeting exists in calendar',
      'attendees mapped to CRM contacts'
    ],
    steps: [
      { id: 'load-meeting', description: 'Pull meeting + attendees' },
      { id: 'last-recap', description: 'Load last-call recap if any' },
      { id: 'open-tasks', description: 'Pull open tasks on deal/account' },
      { id: 'product-usage', description: 'Summarize last-30d usage' },
      { id: 'assemble', description: 'Write one-page brief' }
    ],
    antiPatterns: [
      'keep to one page'
    ],
    validations: [
      'attendee list matches calendar'
    ],
    requiredConnectors: [
      { family: 'calendar', capability: 'meeting.read' },
      { family: 'crm', capability: 'account.read' }
    ],
    tags: ['ae', 'prep'],
    composition: 'parallel'
  },
  {
    id: 'call_recap',
    name: 'Call Recap',
    version: '1.0.0',
    persona: 'AE',
    summary:
      'Produce structured post-call recap: attendees, topics, decisions, action items (with owners + due dates), risks.',
    triggers: [
      { type: 'event', match: 'meeting_intelligence.transcript.ready' }
    ],
    preconditions: [
      'transcript exists for meeting'
    ],
    steps: [
      { id: 'ingest', description: 'Load transcript' },
      { id: 'extract-actions', description: 'Extract action items with owner + due' },
      { id: 'decisions', description: 'Extract explicit decisions' },
      { id: 'crm-sync', description: 'Propose CRM updates for approval' }
    ],
    antiPatterns: [
      'never auto-apply CRM writes without approval'
    ],
    validations: [
      'every action item has owner + due',
      'decisions are grounded in transcript quote'
    ],
    requiredConnectors: [
      { family: 'meeting_intelligence', capability: 'transcripts.read' },
      { family: 'crm', capability: 'activity.log' }
    ],
    tags: ['ae', 'recap'],
    composition: 'serial'
  },
  {
    id: 'renewal_prep',
    name: 'Renewal Prep',
    version: '1.0.0',
    persona: 'CS',
    summary:
      'T-90/60/30 renewal brief: health score, outstanding escalations, usage trend, exec alignment, contract terms.',
    triggers: [
      { type: 'schedule', match: 'renewal.t_minus_90' },
      { type: 'schedule', match: 'renewal.t_minus_60' },
      { type: 'schedule', match: 'renewal.t_minus_30' }
    ],
    preconditions: [
      'contract end date set on account'
    ],
    steps: [
      { id: 'health', description: 'Compute current health score' },
      { id: 'escalations', description: 'List open support escalations' },
      { id: 'usage-trend', description: 'Compute 90-day usage trend' },
      { id: 'exec-map', description: 'Map known execs + last touch' },
      { id: 'brief', description: 'Write structured renewal brief' }
    ],
    antiPatterns: [
      'do not recommend price changes without finance approval'
    ],
    validations: [
      'brief flags at least top 3 risks'
    ],
    requiredConnectors: [
      { family: 'crm', capability: 'account.read' },
      { family: 'support', capability: 'ticket.read' },
      { family: 'warehouse', capability: 'query' }
    ],
    tags: ['cs', 'renewal'],
    composition: 'parallel'
  },
  {
    id: 'health_score',
    name: 'Health Score',
    version: '1.0.0',
    persona: 'CS',
    summary:
      'Compute and maintain a 0-100 health score per account using usage, support load, NPS, exec engagement.',
    triggers: [
      { type: 'schedule', match: 'daily.health.tick' }
    ],
    preconditions: [
      'weighting config present at workspace'
    ],
    steps: [
      { id: 'usage', description: 'Warehouse query for usage vector' },
      { id: 'support', description: 'Support ticket severity sum' },
      { id: 'nps', description: 'Load last NPS response' },
      { id: 'exec', description: 'Last exec engagement within 60d' },
      { id: 'score', description: 'Weighted combine; write + store artifact' }
    ],
    antiPatterns: [
      'do not alert on health drops below warmup window'
    ],
    validations: [
      'score in [0,100]',
      'components explain the score'
    ],
    requiredConnectors: [
      { family: 'warehouse', capability: 'query' },
      { family: 'support', capability: 'ticket.read' }
    ],
    tags: ['cs', 'health'],
    composition: 'parallel'
  },
  {
    id: 'support_context',
    name: 'Support Context',
    version: '1.0.0',
    persona: 'CS',
    summary:
      'Before responding to a support ticket, assemble account context: usage, known bugs, prior tickets, deploy history.',
    triggers: [
      { type: 'event', match: 'support.ticket.assigned' }
    ],
    preconditions: [
      'ticket has account linkage'
    ],
    steps: [
      { id: 'acct', description: 'Pull account + plan' },
      { id: 'prior', description: 'Pull prior tickets last 90d' },
      { id: 'usage', description: 'Usage snapshot' },
      { id: 'known-bugs', description: 'Known-bug matches' }
    ],
    antiPatterns: [
      'do not paste customer PII into public channels'
    ],
    validations: [
      'context is < configured max size'
    ],
    requiredConnectors: [
      { family: 'support', capability: 'ticket.read' },
      { family: 'warehouse', capability: 'query' }
    ],
    tags: ['cs', 'support'],
    composition: 'parallel'
  },
  {
    id: 'usage_analytics',
    name: 'Usage Analytics',
    version: '1.0.0',
    persona: 'DE',
    summary:
      'Ad-hoc usage queries in natural language; compile to warehouse SQL with approval before execution.',
    triggers: [
      { type: 'intent', match: 'how are they using X' }
    ],
    preconditions: [
      'warehouse schema snapshot cached',
      'query allowlist configured'
    ],
    steps: [
      { id: 'parse', description: 'Parse NL intent into question schema' },
      { id: 'compile', description: 'Compile to SQL against warehouse schema' },
      { id: 'dry-run', description: 'Cost-estimate the query' },
      { id: 'approve', description: 'Emit approval if cost > threshold' },
      { id: 'execute', description: 'Run, summarize results' }
    ],
    antiPatterns: [
      'no DDL operations ever',
      'no unbounded scans on fact tables'
    ],
    validations: [
      'query passes allowlist',
      'cost below approved threshold'
    ],
    requiredConnectors: [
      { family: 'warehouse', capability: 'query' }
    ],
    tags: ['de', 'analytics'],
    composition: 'serial'
  },
  {
    id: 'feature_fit',
    name: 'Feature Fit',
    version: '1.0.0',
    persona: 'DE',
    summary:
      'Given a prospect profile + stated needs, score product-feature fit with citations to product docs.',
    triggers: [
      { type: 'intent', match: 'does our product fit their need' }
    ],
    preconditions: [
      'product documentation indexed'
    ],
    steps: [
      { id: 'parse-need', description: 'Extract structured needs from input' },
      { id: 'map-features', description: 'Match features from doc index' },
      { id: 'gaps', description: 'List gaps with workaround suggestion' },
      { id: 'score', description: 'Produce fit score + justification' }
    ],
    antiPatterns: [
      'never invent unshipped features'
    ],
    validations: [
      'every claimed feature cites doc URL'
    ],
    requiredConnectors: [
      { family: 'docs', capability: 'search' }
    ],
    tags: ['de', 'fit'],
    composition: 'serial'
  },
  {
    id: 'ticket_summary',
    name: 'Ticket Summary',
    version: '1.0.0',
    persona: 'DE',
    summary:
      'Summarize a support or engineering ticket thread into structured recap with next-step recommendation.',
    triggers: [
      { type: 'intent', match: 'summarize this ticket' }
    ],
    preconditions: [
      'ticket id provided'
    ],
    steps: [
      { id: 'load', description: 'Load ticket + comments' },
      { id: 'dedupe', description: 'Remove redundant messages' },
      { id: 'recap', description: 'Structured recap: problem, attempts, blockers, next' }
    ],
    antiPatterns: [
      'no customer PII in recap'
    ],
    validations: [
      'each section present'
    ],
    requiredConnectors: [
      { family: 'support', capability: 'ticket.read' }
    ],
    tags: ['de', 'support'],
    composition: 'serial'
  },
  {
    id: 'icp_scoring',
    name: 'ICP Scoring',
    version: '1.0.0',
    persona: 'cross',
    summary:
      'Score a lead or account against the workspace ICP rules: firmographics, technographics, buyer role, behavior.',
    triggers: [
      { type: 'event', match: 'crm.lead.created' },
      { type: 'event', match: 'crm.account.updated' }
    ],
    preconditions: [
      'ICP rules defined',
      'required fields enriched'
    ],
    steps: [
      { id: 'load-rules', description: 'Load ICP rule set' },
      { id: 'evaluate', description: 'Apply rules to the record' },
      { id: 'write-score', description: 'Write score + matched rules to CRM custom field' }
    ],
    antiPatterns: [
      'no free-form deviation from declared rules'
    ],
    validations: [
      'score deterministic given same record + rules'
    ],
    requiredConnectors: [
      { family: 'crm', capability: 'account.read' }
    ],
    tags: ['cross', 'icp', 'scoring'],
    composition: 'serial'
  },
  {
    id: 'positioning_check',
    name: 'Positioning Check',
    version: '1.0.0',
    persona: 'cross',
    summary:
      'Review a message, deck, or blurb against the current positioning doc; flag deviations and suggest edits.',
    triggers: [
      { type: 'intent', match: 'is this on-positioning' }
    ],
    preconditions: [
      'positioning doc indexed'
    ],
    steps: [
      { id: 'load-positioning', description: 'Load current positioning doc' },
      { id: 'scan-input', description: 'Diff input against positioning' },
      { id: 'flag', description: 'Flag off-positioning claims' },
      { id: 'suggest', description: 'Suggest on-positioning replacements' }
    ],
    antiPatterns: [
      'no rewriting whole blocks; annotate only'
    ],
    validations: [
      'each flag cites positioning section'
    ],
    requiredConnectors: [
      { family: 'docs', capability: 'search' }
    ],
    tags: ['cross', 'positioning', 'messaging'],
    composition: 'serial'
  }
]

export const GTM_SKILL_MANIFESTS: readonly SkillManifest[] = GTM_SKILLS

export function loadGtmSkillArtifacts(): SkillArtifact[] {
  return GTM_SKILLS.map((manifest) =>
    makeSkillArtifact(
      manifest,
      fileURLToPath(new URL(`../content/${manifest.id}.md`, import.meta.url))
    )
  )
}
