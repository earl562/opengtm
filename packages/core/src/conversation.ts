import { createEntityBase } from './utils.js'
import type { OpenGtmConversationThread, OpenGtmConversationThreadInput } from '@opengtm/types'

export function createConversationThread(input: OpenGtmConversationThreadInput): OpenGtmConversationThread {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    initiativeId: input.initiativeId,
    messages: input.messages || []
  }
}