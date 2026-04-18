import type { OpenGtmLocalDaemon } from '@opengtm/daemon'
import { buildDefaultConnectorBundle } from '@opengtm/connectors'

export async function handleConnectors(_args: { daemon: OpenGtmLocalDaemon }) {
  const connectors = buildDefaultConnectorBundle()
  return { connectors }
}
