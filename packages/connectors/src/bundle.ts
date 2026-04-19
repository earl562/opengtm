import type { OpenGtmConnectorContract } from '@opengtm/types'
import { resolveConnectorFamilyCandidates, toConnectorFamilyAliasKey } from '@opengtm/types'
import { createContractForFamily } from './contract.js'
import { createOpenGtmCrmConnectorContract } from './opengtm-crm.js'

export function buildDefaultConnectorBundle(): OpenGtmConnectorContract[] {
  return [
    createOpenGtmCrmConnectorContract(),
    createContractForFamily({
      provider: 'local-filesystem',
      family: 'docs'
    })
  ]
}

export function findConnectorContract(
  bundle: OpenGtmConnectorContract[],
  { provider, family }: { provider?: string; family?: string }
): OpenGtmConnectorContract | undefined {
  const candidates = family ? resolveConnectorFamilyCandidates(family) : []
  const normalizedKey = family ? toConnectorFamilyAliasKey(family) : null

  if (provider) {
    return bundle.find((item) => {
      if (item.provider !== provider) {
        return false
      }

      if (!family) {
        return true
      }

      return candidates.length > 0
        ? candidates.includes(item.family)
        : toConnectorFamilyAliasKey(item.family) === normalizedKey
    })
  }

  if (!family) {
    return undefined
  }

  return bundle.find((item) => {
    return candidates.length > 0
      ? candidates.includes(item.family)
      : toConnectorFamilyAliasKey(item.family) === normalizedKey
  })
}
