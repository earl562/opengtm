import { describe, expect, it } from 'vitest'
import { createMockGateway } from '../src/mock.js'

describe('gateways: mock', () => {
  it('captures outbound messages and approvals', async () => {
    const gw = createMockGateway()
    await gw.sendMessage({ channelId: 'c', text: 'hi' })
    await gw.renderApproval({ channelId: 'c', approvalRequestId: 'a1', summary: 'please approve' })
    expect(gw.outbox.length).toBe(2)
  })
})
