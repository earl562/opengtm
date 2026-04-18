import { z } from 'zod'

export const OpenGtmIsoDateSchema = z.string().datetime()

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
  const result = OpenGtmGatewayEventSchema.safeParse(input)
  if (!result.success) {
    return {
      ok: false as const,
      error: result.error.format()
    }
  }
  return {
    ok: true as const,
    value: result.data
  }
}

// Connector capability descriptor (minimal)
export const OpenGtmConnectorCapabilitySchema = z.object({
  provider: z.string().min(1),
  family: z.string().min(1),
  capabilities: z.array(z.string()).default([])
})

export type OpenGtmConnectorCapability = z.infer<typeof OpenGtmConnectorCapabilitySchema>

// Tool invocation/result envelopes (minimal)
export const OpenGtmToolCallSchema = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({})
})

export const OpenGtmToolResultSchema = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  output: z.unknown()
})

// Trace record schema (minimal)
export const OpenGtmTraceStepSchema = z.object({
  name: z.string().min(1),
  status: z.string().optional()
}).passthrough()

export const OpenGtmTraceSchema = z.object({
  id: z.string().min(1),
  workItemId: z.string().min(1),
  lane: z.string().min(1),
  status: z.string().min(1),
  steps: z.array(OpenGtmTraceStepSchema).default([])
})
