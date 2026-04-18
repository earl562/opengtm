import type { OpenGtmConnectorSession } from '@opengtm/types'

export function isSessionExpired(session: OpenGtmConnectorSession, now = new Date()): boolean {
  if (!session.expiresAt) return false
  return new Date(session.expiresAt).getTime() <= now.getTime()
}

export function needsSessionRefresh(session: OpenGtmConnectorSession, now = new Date()): boolean {
  if (!session.refreshAt) return false
  return new Date(session.refreshAt).getTime() <= now.getTime()
}

export function updateSessionStatus(session: OpenGtmConnectorSession, now = new Date()): OpenGtmConnectorSession {
  if (isSessionExpired(session, now)) {
    return { ...session, status: 'expired' }
  }
  if (!session.secretRef) {
    return { ...session, status: 'missing-auth' }
  }
  return { ...session, status: 'ready' }
}
