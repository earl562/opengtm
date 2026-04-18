import { describe, expect, it } from 'vitest'
import { validateGatewayEvent } from '../src/schemas.js'

describe('protocol: gateway event validation', () => {
  it('rejects malformed gateway event', () => {
    const result = validateGatewayEvent({ type: 'command' })
    expect(result.ok).toBe(false)
  })

  it('accepts valid command event', () => {
    const result = validateGatewayEvent({
      gatewayId: 'discord',
      receivedAt: new Date().toISOString(),
      type: 'command',
      userId: 'u1',
      channelId: 'c1',
      command: 'opengtm help',
      args: []
    })
    expect(result.ok).toBe(true)
  })
})
