import { createEntityBase } from './utils.js'
import { assertOneOf } from './utils.js'
import type { OpenGtmInboxItem, OpenGtmInboxItemInput } from '@opengtm/types'
import { OPEN_GTM_INBOX_ITEM_STATUSES, OPEN_GTM_INBOX_ITEM_TRANSITIONS, OPEN_GTM_INBOX_ITEM_KINDS, type OpenGtmInboxItemStatus, type OpenGtmInboxItemKind } from '@opengtm/types'

export function createInboxItem(input: OpenGtmInboxItemInput): OpenGtmInboxItem {
  const base = createEntityBase(input)
  return {
    ...base,
    workspaceId: input.workspaceId,
    initiativeId: input.initiativeId,
    kind: input.kind as OpenGtmInboxItemKind,
    status: (input.status as OpenGtmInboxItemStatus) || 'open',
    title: input.title,
    content: input.content || '',
    sourceRef: input.sourceRef || null
  }
}

export function transitionInboxItem(item: OpenGtmInboxItem, newStatus: OpenGtmInboxItemStatus): OpenGtmInboxItem {
  const allowed = OPEN_GTM_INBOX_ITEM_TRANSITIONS[item.status]
  assertOneOf(newStatus, allowed, 'inbox item transition')
  return { ...item, status: newStatus }
}