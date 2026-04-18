import type { OpenGtmInitiative, OpenGtmWorkItem } from '@opengtm/types'

export function getInitiativeView(initiative: OpenGtmInitiative, workItems: OpenGtmWorkItem[]) {
  return {
    initiative,
    workItems,
    activeItems: workItems.filter((item) => item.status === 'running' || item.status === 'queued'),
    completedItems: workItems.filter((item) => item.status === 'completed')
  }
}