import { z } from 'zod'
import { OpenGtmEnvelopeBaseSchema, OpenGtmIsoDateSchema, validateWithSchema } from './common.js'

export const OpenGtmUserMessageRoleSchema = z.enum(['user', 'assistant', 'system'])

export const OpenGtmUserSessionMessageEnvelopeSchema = OpenGtmEnvelopeBaseSchema.extend({
  kind: z.literal('user.session.message'),
  sessionMessageId: z.string().min(1),
  sessionId: z.string().min(1),
  role: OpenGtmUserMessageRoleSchema,
  content: z.string().min(1),
  delivery: z.object({
    channel: z.string().min(1),
    visibility: z.enum(['public', 'private']).default('private')
  })
})

export const OpenGtmApprovalOptionSchema = z.enum(['approved', 'denied'])

export const OpenGtmApprovalRenderEnvelopeSchema = OpenGtmEnvelopeBaseSchema.extend({
  kind: z.literal('user.approval.render'),
  approvalRequestId: z.string().min(1),
  sessionId: z.string().min(1),
  workItemId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  options: z.array(OpenGtmApprovalOptionSchema).min(1).default(['approved', 'denied'])
})

export const OpenGtmApprovalDecisionEnvelopeSchema = OpenGtmEnvelopeBaseSchema.extend({
  kind: z.literal('user.approval.decision'),
  approvalRequestId: z.string().min(1),
  sessionId: z.string().min(1),
  decision: OpenGtmApprovalOptionSchema,
  decidedAt: OpenGtmIsoDateSchema,
  decidedBy: z.string().min(1),
  reason: z.string().min(1).optional()
})

export const OpenGtmUserEnvelopeSchema = z.discriminatedUnion('kind', [
  OpenGtmUserSessionMessageEnvelopeSchema,
  OpenGtmApprovalRenderEnvelopeSchema,
  OpenGtmApprovalDecisionEnvelopeSchema
])

export type OpenGtmUserSessionMessageEnvelope = z.infer<typeof OpenGtmUserSessionMessageEnvelopeSchema>
export type OpenGtmApprovalRenderEnvelope = z.infer<typeof OpenGtmApprovalRenderEnvelopeSchema>
export type OpenGtmApprovalDecisionEnvelope = z.infer<typeof OpenGtmApprovalDecisionEnvelopeSchema>
export type OpenGtmUserEnvelope = z.infer<typeof OpenGtmUserEnvelopeSchema>

export function validateUserSessionMessageEnvelope(input: unknown) {
  return validateWithSchema(OpenGtmUserSessionMessageEnvelopeSchema, input)
}

export function validateApprovalRenderEnvelope(input: unknown) {
  return validateWithSchema(OpenGtmApprovalRenderEnvelopeSchema, input)
}

export function validateApprovalDecisionEnvelope(input: unknown) {
  return validateWithSchema(OpenGtmApprovalDecisionEnvelopeSchema, input)
}

export function validateUserEnvelope(input: unknown) {
  return validateWithSchema(OpenGtmUserEnvelopeSchema, input)
}
