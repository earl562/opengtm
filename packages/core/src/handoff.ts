import { createEntityBase } from './utils.js'
import type { OpenGtmHandoffPacket, OpenGtmHandoffPacketInput } from '@opengtm/types'
import { OPEN_GTM_LANES, type OpenGtmLane } from '@opengtm/types'

export function createHandoffPacket(input: OpenGtmHandoffPacketInput): OpenGtmHandoffPacket {
  const base = createEntityBase(input)
  return {
    ...base,
    workItemId: input.workItemId,
    fromLane: input.fromLane as OpenGtmLane,
    toLane: input.toLane as OpenGtmLane,
    goal: input.goal,
    contextArtifacts: input.contextArtifacts || [],
    constraints: input.constraints || [],
    approvalState: input.approvalState || 'not-required',
    requiredOutputs: input.requiredOutputs || []
  }
}