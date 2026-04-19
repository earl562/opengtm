import { z } from 'zod'

export const OpenGtmConnectorCapabilitySchema = z.object({
  provider: z.string().min(1),
  family: z.string().min(1),
  capabilities: z.array(z.string()).default([])
})

export type OpenGtmConnectorCapability = z.infer<typeof OpenGtmConnectorCapabilitySchema>
