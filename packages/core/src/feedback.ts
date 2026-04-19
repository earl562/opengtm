import { createEntityBase } from './utils.js'
import type { OpenGtmFeedbackRecord, OpenGtmFeedbackRecordInput } from '@opengtm/types'

export function createFeedbackRecord(input: OpenGtmFeedbackRecordInput): OpenGtmFeedbackRecord {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    traceId: input.traceId,
    approvalRequestId: input.approvalRequestId || null,
    artifactId: input.artifactId || null,
    workflowId: input.workflowId || null,
    persona: input.persona || null,
    action: input.action,
    actor: input.actor,
    message: input.message || `${input.action} recorded`
  }
}
