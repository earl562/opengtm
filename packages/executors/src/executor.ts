import { createLaneExecutionBlueprint, OPEN_GTM_EXECUTION_BLUEPRINTS, type OpenGtmExecutionBlueprint } from './blueprints.js'
import { createRunTrace } from '@opengtm/core'
import { OPEN_GTM_LANES, type OpenGtmLane } from '@opengtm/types'

export interface OpenGtmWorkItemShape {
  id: string
  ownerLane: OpenGtmLane
}

export function prepareExecution({ workItem }: { workItem: OpenGtmWorkItemShape }) {
  const blueprint = createLaneExecutionBlueprint(workItem.ownerLane)

  return {
    lane: blueprint.lane,
    phases: blueprint.phases,
    expectedArtifactKinds: blueprint.artifactKinds,
    connectorFamilies: blueprint.connectorFamilies,
    traceRequired: true
  }
}

export function createLaneExecutor(lane: OpenGtmLane) {
  const blueprint = createLaneExecutionBlueprint(lane)

  return {
    lane,
    blueprint,
    startTrace(workItem: OpenGtmWorkItemShape) {
      return createRunTrace({
        workItemId: workItem.id,
        lane,
        steps: blueprint.phases.map((phase: string) => ({
          name: phase,
          status: 'pending'
        }))
      })
    }
  }
}

export const OPEN_GTM_EXECUTORS: Record<OpenGtmLane, ReturnType<typeof createLaneExecutor>> = Object.fromEntries(
  OPEN_GTM_LANES.map((lane) => [lane, createLaneExecutor(lane)])
) as Record<OpenGtmLane, ReturnType<typeof createLaneExecutor>>