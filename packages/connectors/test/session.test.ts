import { describe, expect, it } from 'vitest'
import type { OpenGtmConnectorSession } from '@opengtm/types'
import { buildMockConnectorBundle, createProviderSession, executeConnectorAction, updateSessionStatus, validateConnectorSession } from '../src/index.js'

function buildSession(overrides: Partial<OpenGtmConnectorSession>): OpenGtmConnectorSession {
  return {
    id: 'sess_1',
    createdAt: '2026-04-18T00:00:00.000Z',
    workspaceId: 'ws_1',
    provider: 'mock-crm',
    family: 'crm',
    authMode: 'oauth',
    status: 'configured',
    scopes: [],
    expiresAt: null,
    refreshAt: null,
    secretRef: null,
    providerAccountRef: null,
    lastError: null,
    capabilityStatus: {},
    validatedScopes: [],
    lastValidatedAt: null,
    ...overrides
  }
}

describe('connector session lifecycle', () => {
  it('marks session missing-auth without secretRef', () => {
    const s = buildSession({ expiresAt: null, refreshAt: null, secretRef: null, status: 'configured' })
    expect(updateSessionStatus(s).status).toBe('missing-auth')
  })

  it('marks session expired when expiresAt is past', () => {
    const s = buildSession({ expiresAt: new Date(Date.now() - 1000).toISOString(), refreshAt: null, secretRef: 'x', status: 'ready' })
    expect(updateSessionStatus(s).status).toBe('expired')
  })

  it('normalizes aliased session families when creating provider sessions', () => {
    const session = createProviderSession({
      workspaceId: 'ws_1',
      provider: 'mock-docs',
      family: 'docs-knowledge',
      secretRef: null
    })

    expect(session.family).toBe('docs')
  })

  it('validates ready sessions and flows metadata into execution', () => {
    const bundle = buildMockConnectorBundle()
    const contract = bundle.find((item) => item.provider === 'mock-crm')
    const session = buildSession({
      secretRef: 'secret/mock-crm',
      status: 'ready',
      scopes: ['accounts.read'],
      validatedScopes: ['accounts.read'],
      capabilityStatus: { 'accounts.read': 'ready' }
    })

    expect(contract).toBeDefined()
    expect(validateConnectorSession(session, contract!)).toEqual({
      status: 'ready',
      authState: 'validated',
      validatedScopes: ['accounts.read'],
      capabilityStatus: { 'accounts.read': 'ready' }
    })

    expect(executeConnectorAction(bundle, {
      family: 'crm',
      action: 'lead.read',
      target: 'leads/42',
      payload: {},
      session
    })).toMatchObject({
      action: 'call-api',
      executionMode: 'live',
      sessionStatus: 'ready',
      authState: 'validated',
      validatedScopes: ['accounts.read']
    })
  })
})
