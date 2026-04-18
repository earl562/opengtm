import type { OpenGtmConnectorContract } from '@opengtm/types'

export function buildDefaultConnectorBundle(): OpenGtmConnectorContract[] {
  return [
    {
      provider: 'local-filesystem',
      family: 'docs-knowledge',
      capabilities: ['read', 'write'],
      readActions: ['read-connector', 'ingest-source'],
      writeActions: ['write-repo', 'mutate-connector'],
      defaultApprovalMode: 'auto',
      traceRequired: false,
      secretShape: []
    }
  ]
}

export function findConnectorContract(
  bundle: OpenGtmConnectorContract[],
  { provider, family }: { provider?: string; family?: string }
): OpenGtmConnectorContract | undefined {
  return bundle.find((item) => 
    (provider && item.provider === provider) || 
    (family && item.family === family)
  )
}