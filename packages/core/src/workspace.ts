import { createEntityBase, slugify } from './utils.js'
import type { OpenGtmWorkspace, OpenGtmWorkspaceInput } from '@opengtm/types'

export function createWorkspace(input: OpenGtmWorkspaceInput): OpenGtmWorkspace {
  const base = createEntityBase(input)
  return {
    ...base,
    name: input.name,
    slug: input.slug || slugify(input.name),
    policyProfile: input.policyProfile || 'default',
    defaultConnectors: input.defaultConnectors || []
  }
}