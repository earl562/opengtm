import type { OpenGtmConnectorFamily, OpenGtmActionType } from '@opengtm/types'

function inferTargetKind(target: string, fallback: string): string {
  const [segment] = target.split(/[/:]/).filter(Boolean)
  return segment || fallback
}

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

  if (family === 'docs') {
    return isWrite
      ? { target, provider, updated: true, kind: 'document', payload }
      : { target, provider, kind: 'document', title: 'Knowledge Artifact', payload }
  }

  if (family === 'crm') {
    const entity = inferTargetKind(target, 'account')
    return isWrite
      ? { target, provider, updated: true, entity, payload }
      : { target, provider, entity, fields: {}, payload }
  }

  if (family === 'enrichment') {
    return {
      target,
      provider,
      profile: {
        company: inferTargetKind(target, 'account'),
        confidence: 0.98
      },
      payload
    }
  }

  if (family === 'web_research') {
    return {
      target,
      provider,
      results: [],
      pageTitle: 'Simulated Page',
      action,
      payload
    }
  }

  if (family === 'meeting_intelligence') {
    return {
      target,
      provider,
      transcriptId: target,
      speakers: [],
      snippets: [],
      payload
    }
  }

  if (family === 'warehouse') {
    return {
      target,
      provider,
      query: typeof payload.sql === 'string' ? payload.sql : null,
      rowCount: 0,
      rows: [],
      payload
    }
  }

  if (family === 'email') {
    return isWrite
      ? { target, provider, sent: true, draftId: `draft:${target}`, payload }
      : { target, provider, threads: [], payload }
  }

  if (family === 'calendar') {
    return isWrite
      ? { target, provider, updated: true, eventId: `event:${target}`, payload }
      : { target, provider, meetings: [], payload }
  }

  if (family === 'comms') {
    return isWrite
      ? { target, provider, dispatched: true, channel: inferTargetKind(target, 'channel'), payload }
      : { target, provider, messages: [], channel: inferTargetKind(target, 'channel'), payload }
  }

  if (family === 'support') {
    return isWrite
      ? { target, provider, updated: true, ticketId: target, payload }
      : { target, provider, ticketId: target, status: 'open', payload }
  }

  return isWrite
    ? { target, provider, status: 'updated', payload }
    : { target, provider, status: 'read', payload }
}
