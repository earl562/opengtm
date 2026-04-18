import { createEntityBase } from './utils.js'
import { assertOneOf } from './utils.js'
import type { OpenGtmRunAttempt, OpenGtmRunAttemptInput } from '@opengtm/types'
import { OPEN_GTM_RUN_ATTEMPT_STATUSES, OPEN_GTM_RUN_ATTEMPT_TRANSITIONS, type OpenGtmRunAttemptStatus } from '@opengtm/types'

export function createRunAttempt(input: OpenGtmRunAttemptInput): OpenGtmRunAttempt {
  const base = createEntityBase(input)
  return {
    ...base,
    workItemId: input.workItemId,
    status: (input.status as OpenGtmRunAttemptStatus) || 'running',
    startedAt: input.startedAt ? new Date(input.startedAt).toISOString() : new Date().toISOString(),
    endedAt: input.endedAt ? new Date(input.endedAt).toISOString() : null
  }
}

export function transitionRunAttempt(attempt: OpenGtmRunAttempt, newStatus: OpenGtmRunAttemptStatus): OpenGtmRunAttempt {
  const allowed = OPEN_GTM_RUN_ATTEMPT_TRANSITIONS[attempt.status]
  assertOneOf(newStatus, allowed, 'run attempt transition')
  return {
    ...attempt,
    status: newStatus,
    endedAt: newStatus === 'completed' || newStatus === 'failed' || newStatus === 'cancelled'
      ? new Date().toISOString()
      : attempt.endedAt
  }
}