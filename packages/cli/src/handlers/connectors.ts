import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { buildDefaultConnectorBundle } from '@opengtm/connectors'

export async function handleConnectors(_args: { daemon: OpenGtmLocalDaemon }) {
  const connectors = buildDefaultConnectorBundle()
  return {
    connectors,
    summary: {
      total: connectors.length,
      families: Array.from(new Set(connectors.map((connector) => connector.family))).sort()
    }
  }
}
