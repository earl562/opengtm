import { z } from 'zod'
import { OpenGtmEnvelopeBaseSchema, validateWithSchema } from './common.js'

export const OpenGtmSubagentStatusSchema = z.enum([
  'queued',
  'running',
  'awaiting-approval',
  'blocked',
  'completed',
  'failed',
  'cancelled'
])

export const OpenGtmSubagentTaskSchema = z.object({
  goal: z.string().min(1),
  constraints: z.array(z.string().min(1)).default([]),
  requiredOutputs: z.array(z.string().min(1)).default([]),
  artifacts: z.array(z.string().min(1)).default([])
})

export const OpenGtmSubagentDelegationRequestSchema = OpenGtmEnvelopeBaseSchema.extend({
  kind: z.literal('subagent.delegation.request'),
  delegationId: z.string().min(1),
  subagentType: z.string().min(1),
  task: OpenGtmSubagentTaskSchema,
  lifecycle: z.object({
    status: z.literal('queued').default('queued'),
    priority: z.enum(['low', 'normal', 'high']).default('normal')
  }).default({ status: 'queued' })
})

export const OpenGtmSubagentStatusUpdateSchema = OpenGtmEnvelopeBaseSchema.extend({
  kind: z.literal('subagent.status.update'),
  delegationId: z.string().min(1),
  subagentType: z.string().min(1),
  status: OpenGtmSubagentStatusSchema,
  summary: z.string().min(1),
  progress: z.number().min(0).max(100).optional(),
  approvalRequestId: z.string().min(1).optional()
})

export const OpenGtmSubagentFinalResultSchema = OpenGtmEnvelopeBaseSchema.extend({
  kind: z.literal('subagent.final.result'),
  delegationId: z.string().min(1),
  subagentType: z.string().min(1),
  status: z.enum(['completed', 'failed', 'cancelled']),
  summary: z.string().min(1),
  output: z.unknown().optional(),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1)
  }).optional(),
  artifacts: z.array(z.string().min(1)).default([])
}).superRefine((value, ctx) => {
  if (value.status === 'completed' && value.output === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['output'],
      message: 'Completed subagent result must include output'
    })
  }

  if (value.status === 'failed' && !value.error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['error'],
      message: 'Failed subagent result must include error'
    })
  }
})

export const OpenGtmSubagentEnvelopeSchema = z.union([
  OpenGtmSubagentDelegationRequestSchema,
  OpenGtmSubagentStatusUpdateSchema,
  OpenGtmSubagentFinalResultSchema
])

export type OpenGtmSubagentDelegationRequest = z.infer<typeof OpenGtmSubagentDelegationRequestSchema>
export type OpenGtmSubagentStatus = z.infer<typeof OpenGtmSubagentStatusSchema>
export type OpenGtmSubagentStatusUpdate = z.infer<typeof OpenGtmSubagentStatusUpdateSchema>
export type OpenGtmSubagentFinalResult = z.infer<typeof OpenGtmSubagentFinalResultSchema>
export type OpenGtmSubagentEnvelope = z.infer<typeof OpenGtmSubagentEnvelopeSchema>

export function validateSubagentDelegationRequest(input: unknown) {
  return validateWithSchema(OpenGtmSubagentDelegationRequestSchema, input)
}

export function validateSubagentStatusUpdate(input: unknown) {
  return validateWithSchema(OpenGtmSubagentStatusUpdateSchema, input)
}

export function validateSubagentFinalResult(input: unknown) {
  return validateWithSchema(OpenGtmSubagentFinalResultSchema, input)
}

export function validateSubagentEnvelope(input: unknown) {
  return validateWithSchema(OpenGtmSubagentEnvelopeSchema, input)
}
