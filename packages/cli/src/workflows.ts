import type { OpenGtmWorkflowManifest } from '@opengtm/types'
import { OPEN_GTM_CANONICAL_SCENARIO_ID, OPEN_GTM_CANONICAL_SCENARIO_LABEL } from './truthfulness.js'

export { OPEN_GTM_CANONICAL_SCENARIO_ID, OPEN_GTM_CANONICAL_SCENARIO_LABEL }

const REFERENCE_WORKFLOWS: OpenGtmWorkflowManifest[] = [
  {
    id: 'crm.roundtrip',
    name: 'Canonical CRM Roundtrip',
    description: 'Ingest a lead.created event, produce research and outreach artifacts, route approval, and log the outcome back to the local CRM fixture.',
    trigger: 'manual',
    lane: 'ops-automate',
    persona: 'SDR',
    fixtureSetId: 'crm-roundtrip',
    connectorFamilies: ['crm', 'docs', 'comms'],
    artifactKinds: ['analysis', 'approval', 'trace'],
    requiresApproval: true,
    supportTier: 'live',
    isCanonical: true
  },
  {
    id: 'sdr.inbound_triage',
    name: 'Inbound Triage',
    description: 'Classify inbound leads, apply routing rules, and capture the operator handoff.',
    trigger: 'manual',
    lane: 'ops-automate',
    persona: 'SDR',
    fixtureSetId: 'sdr-inbound-triage',
    connectorFamilies: ['crm', 'comms'],
    artifactKinds: ['campaign-brief', 'trace'],
    requiresApproval: false,
    supportTier: 'live',
    isCanonical: false
  },
  {
    id: 'sdr.lead_research',
    name: 'Lead Research',
    description: 'Gather account and persona context before any outreach.',
    trigger: 'manual',
    lane: 'research',
    persona: 'SDR',
    fixtureSetId: 'sdr-lead-research',
    connectorFamilies: ['crm', 'enrichment', 'web_research', 'meeting_intelligence'],
    artifactKinds: ['analysis', 'trace'],
    requiresApproval: false,
    supportTier: 'live',
    isCanonical: false
  },
  {
    id: 'sdr.outreach_compose',
    name: 'Outreach Compose',
    description: 'Prepare a draft outreach asset and route it through human approval.',
    trigger: 'manual',
    lane: 'ops-automate',
    persona: 'SDR',
    fixtureSetId: 'sdr-outreach-compose',
    connectorFamilies: ['email', 'comms', 'crm'],
    artifactKinds: ['approval', 'campaign-brief'],
    requiresApproval: true,
    supportTier: 'live',
    isCanonical: false
  },
  {
    id: 'sdr.outreach_sequence',
    name: 'Outreach Sequence',
    description: 'Prepare a sequenced outreach follow-up plan behind an approval gate.',
    trigger: 'manual',
    lane: 'ops-automate',
    persona: 'SDR',
    fixtureSetId: 'sdr-outreach-sequence',
    connectorFamilies: ['email', 'crm', 'comms'],
    artifactKinds: ['approval', 'campaign-brief'],
    requiresApproval: true,
    supportTier: 'live',
    isCanonical: false
  },
  {
    id: 'ae.account_brief',
    name: 'Account Brief',
    description: 'Generate a structured account brief for the AE team.',
    trigger: 'manual',
    lane: 'research',
    persona: 'AE',
    fixtureSetId: 'ae-account-brief',
    connectorFamilies: ['crm', 'warehouse', 'meeting_intelligence'],
    artifactKinds: ['analysis', 'trace'],
    requiresApproval: false,
    supportTier: 'live',
    isCanonical: false
  },
  {
    id: 'ae.deal_risk_scan',
    name: 'Deal Risk Scan',
    description: 'Surface late-stage risk signals with supporting evidence.',
    trigger: 'manual',
    lane: 'research',
    persona: 'AE',
    fixtureSetId: 'ae-deal-risk-scan',
    connectorFamilies: ['crm', 'meeting_intelligence'],
    artifactKinds: ['analysis', 'trace'],
    requiresApproval: false,
    supportTier: 'live',
    isCanonical: false
  },
  {
    id: 'ae.expansion_signal',
    name: 'Expansion Signal',
    description: 'Summarize evidence for expansion opportunities.',
    trigger: 'manual',
    lane: 'research',
    persona: 'AE',
    fixtureSetId: 'ae-expansion-signal',
    connectorFamilies: ['warehouse', 'web_research'],
    artifactKinds: ['analysis', 'trace'],
    requiresApproval: false,
    supportTier: 'live',
    isCanonical: false
  },
  {
    id: 'cs.renewal_prep',
    name: 'Renewal Prep',
    description: 'Assemble a renewal brief with health, risks, and escalations.',
    trigger: 'manual',
    lane: 'research',
    persona: 'CS',
    fixtureSetId: 'cs-renewal-prep',
    connectorFamilies: ['crm', 'support', 'warehouse'],
    artifactKinds: ['analysis', 'trace'],
    requiresApproval: false,
    supportTier: 'live',
    isCanonical: false
  },
  {
    id: 'cs.health_score',
    name: 'Health Score',
    description: 'Compute an explainable health score for an account.',
    trigger: 'manual',
    lane: 'research',
    persona: 'CS',
    fixtureSetId: 'cs-health-score',
    connectorFamilies: ['warehouse', 'support'],
    artifactKinds: ['analysis', 'trace'],
    requiresApproval: false,
    supportTier: 'live',
    isCanonical: false
  },
  {
    id: 'de.usage_analytics',
    name: 'Usage Analytics',
    description: 'Compile a safe usage analytics answer for GTM stakeholders.',
    trigger: 'manual',
    lane: 'research',
    persona: 'DE',
    fixtureSetId: 'de-usage-analytics',
    connectorFamilies: ['warehouse'],
    artifactKinds: ['analysis', 'trace'],
    requiresApproval: false,
    supportTier: 'live',
    isCanonical: false
  }
]

export function listReferenceWorkflows(): OpenGtmWorkflowManifest[] {
  return [...REFERENCE_WORKFLOWS]
}

export function getReferenceWorkflow(id: string): OpenGtmWorkflowManifest | undefined {
  return REFERENCE_WORKFLOWS.find((workflow) => workflow.id === id)
}
