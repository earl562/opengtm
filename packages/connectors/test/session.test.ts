import { describe, expect, it } from 'vitest'
import { updateSessionStatus } from '../src/session.js'

describe('connector session lifecycle', () => {
  it('marks session missing-auth without secretRef', () => {
    const s: any = { expiresAt: null, refreshAt: null, secretRef: null, status: 'configured' }
    expect(updateSessionStatus(s).status).toBe('missing-auth')
  })

  it('marks session expired when expiresAt is past', () => {
    const s: any = { expiresAt: new Date(Date.now() - 1000).toISOString(), refreshAt: null, secretRef: 'x', status: 'ready' }
    expect(updateSessionStatus(s).status).toBe('expired')
  })
})
