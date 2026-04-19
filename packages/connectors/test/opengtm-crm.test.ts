import { afterEach, describe, expect, it } from 'vitest'
import { buildDefaultConnectorBundle, createOpenGtmCrmConnector, OPENGTM_CRM_CONNECTOR_PROVIDER } from '../src/index.js'
import { startCrmServer, type StartedOpenGtmCrmServer } from '../../../opengtm-crm/src/server.js'

const startedServers: StartedOpenGtmCrmServer[] = []

afterEach(async () => {
  await Promise.all(startedServers.splice(0).map((server) => server.close()))
})

describe('opengtm-crm connector', () => {
  it('is exposed in the default connector bundle for the crm family', () => {
    expect(buildDefaultConnectorBundle()).toContainEqual(expect.objectContaining({
      provider: OPENGTM_CRM_CONNECTOR_PROVIDER,
      family: 'crm',
      secretShape: []
    }))
  })

  it('talks to a live in-process opengtm-crm server across the supported surface', async () => {
    const crmServer = await startCrmServer({ port: 0, dbFile: ':memory:' })
    startedServers.push(crmServer)

    const connector = createOpenGtmCrmConnector({ baseUrl: crmServer.baseUrl })

    await expect(connector.getHealth()).resolves.toEqual({ ok: true })

    const account = await connector.createAccount({ name: 'Acme' })
    expect(account).toEqual(expect.objectContaining({ name: 'Acme' }))
    await expect(connector.listAccounts()).resolves.toEqual([
      expect.objectContaining({ id: account.id, name: 'Acme' })
    ])

    const lead = await connector.createLead({ name: 'Pat', email: 'pat@example.com' })
    expect(lead).toEqual(expect.objectContaining({ name: 'Pat', email: 'pat@example.com', status: 'new' }))
    await expect(connector.listLeads()).resolves.toEqual([
      expect.objectContaining({ id: lead.id, name: 'Pat' })
    ])

    const activity = await connector.createActivity({
      subject: 'Intro call',
      type: 'call',
      relatedType: 'lead',
      relatedId: lead.id
    })
    expect(activity).toEqual(expect.objectContaining({ subject: 'Intro call', type: 'call', relatedId: lead.id }))
    await expect(connector.listActivities()).resolves.toEqual([
      expect.objectContaining({ id: activity.id, subject: 'Intro call' })
    ])

    await expect(connector.execute({ action: 'call-api', target: 'accounts' })).resolves.toMatchObject({
      provider: OPENGTM_CRM_CONNECTOR_PROVIDER,
      family: 'crm',
      action: 'read-connector',
      target: 'accounts',
      executionMode: 'live',
      data: [expect.objectContaining({ id: account.id, name: 'Acme' })]
    })

    await expect(
      connector.execute({
        action: 'mutate-connector',
        target: 'activities',
        payload: { subject: 'Follow-up note', type: 'note' }
      })
    ).resolves.toMatchObject({
      provider: OPENGTM_CRM_CONNECTOR_PROVIDER,
      family: 'crm',
      action: 'mutate-connector',
      target: 'activities',
      executionMode: 'live',
      data: expect.objectContaining({ subject: 'Follow-up note', type: 'note' })
    })
  })
})
