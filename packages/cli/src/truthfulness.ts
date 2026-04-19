import type { OpenGtmSupportTier } from '@opengtm/types'

export const OPEN_GTM_CANONICAL_SCENARIO_ID = 'crm.roundtrip'
export const OPEN_GTM_CANONICAL_SCENARIO_LABEL =
  'lead.created -> research artifact -> draft outreach artifact -> approval decision -> CRM activity/log update'

export function classifyExecutionSupportTier(args: {
  provider?: string | null
  executionMode?: string | null
}): OpenGtmSupportTier {
  if (args.provider?.startsWith('mock-')) {
    return 'simulated'
  }

  if (args.executionMode === 'simulated') {
    return 'simulated'
  }

  return 'live'
}
