import { HIGH_TRUST_CONNECTOR_FAMILIES } from './profiles.js'
import type { OpenGtmRiskLevel, OpenGtmLane, OpenGtmActionType, OpenGtmConnectorFamily } from '@opengtm/types'

export function classifyRiskLevel({
  lane,
  actionType,
  connectorFamily = null
}: {
  lane: string
  actionType: string
  connectorFamily?: string | null
}): OpenGtmRiskLevel {
  if (connectorFamily && (HIGH_TRUST_CONNECTOR_FAMILIES as readonly string[]).includes(connectorFamily)) return 'high'
  if (actionType === 'browser-act' || actionType === 'send-message') return 'critical'
  if (actionType === 'mutate-connector' || actionType === 'write-repo') return 'medium'
  if (lane === 'research') return 'low'
  return 'medium'
}