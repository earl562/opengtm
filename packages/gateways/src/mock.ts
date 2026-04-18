import type {
  OpenGtmGateway,
  OpenGtmGatewayEvent,
  OpenGtmGatewayRenderApprovalInput,
  OpenGtmGatewaySendMessageInput
} from './events.js'

export function createMockGateway({ id = 'mock-gateway' }: { id?: string } = {}): OpenGtmGateway & {
  emit: (event: OpenGtmGatewayEvent) => void
  outbox: Array<{ type: 'message' | 'approval'; payload: unknown }>
} {
  const handlers = new Set<(event: OpenGtmGatewayEvent) => Promise<void> | void>()
  const outbox: Array<{ type: 'message' | 'approval'; payload: unknown }> = []

  return {
    id,
    outbox,
    emit(event) {
      for (const handler of handlers) {
        void handler(event)
      }
    },
    async start() {},
    async stop() {},
    onEvent(handler) {
      handlers.add(handler)
    },
    async sendMessage(input: OpenGtmGatewaySendMessageInput) {
      outbox.push({ type: 'message', payload: input })
    },
    async renderApproval(input: OpenGtmGatewayRenderApprovalInput) {
      outbox.push({ type: 'approval', payload: input })
    }
  }
}
