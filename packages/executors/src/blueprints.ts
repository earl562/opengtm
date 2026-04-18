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
    connectorFamilies: ['docs-knowledge', 'sheets-tables', 'api-internal-tools', 'crm'],
    artifactKinds: ['source-record', 'synthesis', 'decision-log']
  },
  'build-integrate': {
    phases: ['spec', 'implement', 'validate', 'handoff'],
    connectorFamilies: ['docs-knowledge', 'sheets-tables', 'api-internal-tools'],
    artifactKinds: ['spec', 'analysis', 'trace']
  },
  'ops-automate': {
    phases: ['load-context', 'prepare-action', 'approve-or-send', 'record-outcome'],
    connectorFamilies: ['crm', 'browser-automation', 'email-calendar', 'docs-knowledge', 'sheets-tables', 'api-internal-tools'],
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