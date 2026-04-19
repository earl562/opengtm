import { OPEN_GTM_LANES, type OpenGtmLane } from '@opengtm/types'

export interface OpenGtmExecutionBlueprint {
  lane: OpenGtmLane
  phases: string[]
  connectorFamilies: string[]
  artifactKinds: string[]
}

export const OPEN_GTM_EXECUTION_BLUEPRINTS: Record<OpenGtmLane, Omit<OpenGtmExecutionBlueprint, 'lane'>> = {
  research: {
    phases: ['ingest', 'compare', 'synthesize', 'handoff'],
    connectorFamilies: ['docs', 'crm', 'enrichment', 'web_research', 'meeting_intelligence', 'warehouse'],
    artifactKinds: ['source-record', 'synthesis', 'decision-log']
  },
  'build-integrate': {
    phases: ['spec', 'implement', 'validate', 'handoff'],
    connectorFamilies: ['docs'],
    artifactKinds: ['spec', 'analysis', 'trace']
  },
  'ops-automate': {
    phases: ['load-context', 'prepare-action', 'approve-or-send', 'record-outcome'],
    connectorFamilies: ['crm', 'email', 'calendar', 'comms', 'support', 'docs', 'warehouse', 'meeting_intelligence', 'web_research'],
    artifactKinds: ['campaign-brief', 'approval', 'trace']
  }
}

export function createLaneExecutionBlueprint(lane: OpenGtmLane): OpenGtmExecutionBlueprint {
  if (!(OPEN_GTM_LANES as readonly string[]).includes(lane)) {
    throw new Error(`Unknown OpenGTM lane: ${lane}`)
  }
  const blueprint = OPEN_GTM_EXECUTION_BLUEPRINTS[lane]

  return {
    lane,
    ...blueprint
  }
}
