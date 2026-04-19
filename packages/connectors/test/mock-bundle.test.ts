import { describe, expect, it } from 'vitest'
import { normalizeConnectorFamily } from '@opengtm/types'
import { buildMockConnectorBundle, executeConnectorAction, findConnectorContract, mapHarnessActionToConnectorAction } from '../src/index.js'

describe('connectors: mock bundle', () => {
  it('includes expected connector families', () => {
    const bundle = buildMockConnectorBundle()
    const families = bundle.map((c) => c.family)
    expect(families).toEqual(expect.arrayContaining([
      'crm',
      'enrichment',
      'web_research',
      'meeting_intelligence',
      'warehouse',
      'email',
      'calendar',
      'comms',
      'support',
      'docs'
    ]))
  })

  it('normalizes legacy family names to canonical GTM families', () => {
    expect(normalizeConnectorFamily('docs-knowledge')).toBe('docs')
    expect(normalizeConnectorFamily('browser-automation')).toBe('web_research')
    expect(normalizeConnectorFamily('email-calendar')).toBe('email')
    expect(normalizeConnectorFamily('communications')).toBe('comms')
  })

  it('finds contracts through canonical or legacy family lookup', () => {
    const bundle = buildMockConnectorBundle()

    expect(findConnectorContract(bundle, { family: 'docs-knowledge' })?.provider).toBe('mock-docs')
    expect(findConnectorContract(bundle, { provider: 'mock-calendar', family: 'email-calendar' })?.family).toBe('calendar')
    expect(findConnectorContract(bundle, { family: 'browser-automation' })?.family).toBe('web_research')
  })

  it('maps skill capabilities onto connector actions', () => {
    const bundle = buildMockConnectorBundle()
    const emailContract = findConnectorContract(bundle, { family: 'email' })
    const warehouseContract = findConnectorContract(bundle, { family: 'warehouse' })

    expect(emailContract).toBeDefined()
    expect(warehouseContract).toBeDefined()
    expect(mapHarnessActionToConnectorAction(emailContract!, 'draft')).toBe('send-message')
    expect(mapHarnessActionToConnectorAction(warehouseContract!, 'query')).toBe('call-api')
  })

  it('executes offline with deterministic metadata', () => {
    const bundle = buildMockConnectorBundle()
    const result = executeConnectorAction(bundle, {
      family: 'docs',
      action: 'read-connector',
      target: 'hello',
      payload: { q: 1 }
    })

    expect(result.provider).toBe('mock-docs')
    expect(result.family).toBe('docs')
    expect(result.executionMode).toBe('live')
    expect(result.requiresSession).toBe(false)
    expect(result.sessionStatus).toBe('ready')
    expect(result.data).toEqual({
      target: 'hello',
      provider: 'mock-docs',
      kind: 'document',
      title: 'Knowledge Artifact',
      payload: { q: 1 }
    })
  })

  it('executes through legacy family aliases without provider lookup', () => {
    const bundle = buildMockConnectorBundle()

    expect(executeConnectorAction(bundle, {
      family: 'docs-knowledge',
      action: 'read-connector',
      target: 'brief.md',
      payload: {}
    })).toMatchObject({
      provider: 'mock-docs',
      family: 'docs',
      action: 'read-connector',
      executionMode: 'live'
    })

    expect(executeConnectorAction(bundle, {
      family: 'browser-automation',
      action: 'search',
      target: 'acme pricing',
      payload: {}
    })).toMatchObject({
      provider: 'mock-web',
      family: 'web_research',
      action: 'read-connector',
      executionMode: 'simulated'
    })
  })

  it('simulates execution when secretShape requires a session but session is missing', () => {
    const bundle = buildMockConnectorBundle()
    const result = executeConnectorAction(bundle, {
      family: 'crm',
      action: 'call-api',
      target: 'accounts/1',
      payload: {}
      // no session
    })

    expect(result.requiresSession).toBe(true)
    expect(result.executionMode).toBe('simulated')
    expect(result.sessionStatus).toBe('missing-auth')
    expect(result.authState).toBe('missing-auth')
    expect(result.mode).toBe('read')
    expect(result.data).toEqual({
      target: 'accounts/1',
      provider: 'mock-crm',
      entity: 'accounts',
      fields: {},
      payload: {}
    })
  })

  it('returns deterministic metadata for representative GTM families', () => {
    const bundle = buildMockConnectorBundle()

    expect(executeConnectorAction(bundle, {
      family: 'web_research',
      action: 'search',
      target: 'openai latest funding',
      payload: { limit: 3 }
    })).toMatchObject({
      action: 'read-connector',
      executionMode: 'simulated',
      data: {
        provider: 'mock-web',
        results: [],
        pageTitle: 'Simulated Page'
      }
    })

    expect(executeConnectorAction(bundle, {
      family: 'warehouse',
      action: 'query',
      target: 'usage.sql',
      payload: { sql: 'select 1' }
    })).toMatchObject({
      action: 'call-api',
      data: {
        provider: 'mock-warehouse',
        query: 'select 1',
        rowCount: 0,
        rows: []
      }
    })
  })
})
