import { z } from 'zod'
import { OpenGtmIsoDateSchema, validateWithSchema } from './common.js'

export const OpenGtmGatewayEventBaseSchema = z.object({
  gatewayId: z.string().min(1),
  receivedAt: OpenGtmIsoDateSchema
})

export const OpenGtmGatewayCommandEventSchema = OpenGtmGatewayEventBaseSchema.extend({
  type: z.literal('command'),
  userId: z.string().min(1),
  channelId: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string())
})

export const OpenGtmGatewayMessageEventSchema = OpenGtmGatewayEventBaseSchema.extend({
  type: z.literal('message'),
  userId: z.string().min(1),
  channelId: z.string().min(1),
  text: z.string()
})

export const OpenGtmGatewayApprovalRequestEventSchema = OpenGtmGatewayEventBaseSchema.extend({
  type: z.literal('approval.request'),
  approvalRequestId: z.string().min(1),
  workItemId: z.string().min(1),
  summary: z.string().min(1)
})

export const OpenGtmGatewayApprovalDecisionEventSchema = OpenGtmGatewayEventBaseSchema.extend({
  type: z.literal('approval.decision'),
  approvalRequestId: z.string().min(1),
  decision: z.enum(['approved', 'denied']),
  decidedBy: z.string().min(1),
  decidedAt: OpenGtmIsoDateSchema
})

export const OpenGtmGatewayEventSchema = z.discriminatedUnion('type', [
  OpenGtmGatewayCommandEventSchema,
  OpenGtmGatewayMessageEventSchema,
  OpenGtmGatewayApprovalRequestEventSchema,
  OpenGtmGatewayApprovalDecisionEventSchema
])

export type OpenGtmGatewayEvent = z.infer<typeof OpenGtmGatewayEventSchema>

export function validateGatewayEvent(input: unknown) {
  return validateWithSchema(OpenGtmGatewayEventSchema, input)
}
