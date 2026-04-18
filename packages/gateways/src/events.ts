export type OpenGtmGatewayId = string
export type OpenGtmUserId = string
export type OpenGtmChannelId = string

export interface OpenGtmGatewayEventBase {
  gatewayId: OpenGtmGatewayId
  receivedAt: string
}

export interface OpenGtmGatewayCommandEvent extends OpenGtmGatewayEventBase {
  type: 'command'
  userId: OpenGtmUserId
  channelId: OpenGtmChannelId
  command: string
  args: string[]
}

export interface OpenGtmGatewayMessageEvent extends OpenGtmGatewayEventBase {
  type: 'message'
  userId: OpenGtmUserId
  channelId: OpenGtmChannelId
  text: string
}

export interface OpenGtmGatewayApprovalRequestEvent extends OpenGtmGatewayEventBase {
  type: 'approval.request'
  approvalRequestId: string
  workItemId: string
  summary: string
}

export interface OpenGtmGatewayApprovalDecisionEvent extends OpenGtmGatewayEventBase {
  type: 'approval.decision'
  approvalRequestId: string
  decision: 'approved' | 'denied'
  decidedBy: OpenGtmUserId
  decidedAt: string
}

export type OpenGtmGatewayEvent =
  | OpenGtmGatewayCommandEvent
  | OpenGtmGatewayMessageEvent
  | OpenGtmGatewayApprovalRequestEvent
  | OpenGtmGatewayApprovalDecisionEvent

export interface OpenGtmGatewaySendMessageInput {
  channelId: OpenGtmChannelId
  text: string
}

export interface OpenGtmGatewayRenderApprovalInput {
  channelId: OpenGtmChannelId
  approvalRequestId: string
  summary: string
}

export interface OpenGtmGateway {
  id: OpenGtmGatewayId
  start: () => Promise<void>
  stop: () => Promise<void>
  onEvent: (handler: (event: OpenGtmGatewayEvent) => Promise<void> | void) => void
  sendMessage: (input: OpenGtmGatewaySendMessageInput) => Promise<void>
  renderApproval: (input: OpenGtmGatewayRenderApprovalInput) => Promise<void>
}
