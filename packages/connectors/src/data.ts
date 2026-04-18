import type { OpenGtmConnectorFamily, OpenGtmActionType } from '@opengtm/types'

export function buildNormalizedData({
  family,
  provider,
  action,
  target,
  payload
}: {
  family: OpenGtmConnectorFamily
  provider: string
  action: OpenGtmActionType
  target: string
  payload: Record<string, unknown>
}) {
  const isWrite = action === 'mutate-connector' || action === 'send-message' || action === 'write-repo'

  if (family === 'docs-knowledge') {
    return isWrite
      ? { target, provider, updated: true, kind: 'document', payload }
      : { target, provider, kind: 'document', title: 'Knowledge Artifact', payload }
  }

  if (family === 'sheets-tables') {
    return isWrite
      ? { target, provider, updatedRows: 1, payload }
      : { target, provider, rows: [], payload }
  }

  if (family === 'crm') {
    return isWrite
      ? { target, provider, updated: true, entity: 'account', payload }
      : { target, provider, entity: 'account', fields: {}, payload }
  }

  if (family === 'browser-automation') {
    return {
      target,
      provider,
      pageTitle: 'Simulated Page',
      action,
      payload
    }
  }

  if (family === 'email-calendar') {
    return isWrite
      ? { target, provider, sent: true, payload }
      : { target, provider, items: [], payload }
  }

  return isWrite
    ? { target, provider, status: 'updated', payload }
    : { target, provider, status: 'read', payload }
}