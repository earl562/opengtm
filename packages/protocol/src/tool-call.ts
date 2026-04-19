import { z } from 'zod'
import { OpenGtmEnvelopeBaseSchema, validateWithSchema } from './common.js'

export const OpenGtmToolCallLifecycleStateSchema = z.enum(['requested', 'accepted', 'running', 'completed', 'failed'])

export const OpenGtmToolCallModeSchema = z.enum(['sync', 'async'])

export const OpenGtmToolCallLifecycleSchema = z.object({
  state: OpenGtmToolCallLifecycleStateSchema.default('requested'),
  mode: OpenGtmToolCallModeSchema.default('sync'),
  timeoutMs: z.number().int().positive().optional()
})

export const OpenGtmToolCallRequestSchema = OpenGtmEnvelopeBaseSchema.extend({
  kind: z.literal('tool.call.request'),
  callId: z.string().min(1),
  tool: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
  lifecycle: OpenGtmToolCallLifecycleSchema.default({}),
  permissions: z.object({
    idempotent: z.boolean().default(false),
    mutatesExternalState: z.boolean().default(false)
  }).default({})
})

export const OpenGtmToolCallResultStatusSchema = z.enum(['ok', 'error'])

export const OpenGtmToolCallErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean().default(false),
  details: z.unknown().optional()
})

export const OpenGtmToolCallResultSchema = OpenGtmEnvelopeBaseSchema.extend({
  kind: z.literal('tool.call.result'),
  callId: z.string().min(1),
  tool: z.string().min(1),
  status: OpenGtmToolCallResultStatusSchema,
  lifecycle: z.object({
    state: z.enum(['completed', 'failed']).default('completed'),
    durationMs: z.number().int().nonnegative().optional()
  }).default({}),
  output: z.unknown().optional(),
  error: OpenGtmToolCallErrorSchema.optional()
}).superRefine((value, ctx) => {
  if (value.status === 'ok' && value.output === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['output'],
      message: 'Tool call result with ok status must include output'
    })
  }

  if (value.status === 'error' && !value.error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['error'],
      message: 'Tool call result with error status must include error'
    })
  }
})

export const OpenGtmToolCallEnvelopeSchema = z.union([
  OpenGtmToolCallRequestSchema,
  OpenGtmToolCallResultSchema
])

export type OpenGtmToolCallRequest = z.infer<typeof OpenGtmToolCallRequestSchema>
export type OpenGtmToolCallResultStatus = z.infer<typeof OpenGtmToolCallResultStatusSchema>
export type OpenGtmToolCallError = z.infer<typeof OpenGtmToolCallErrorSchema>
export type OpenGtmToolCallResult = z.infer<typeof OpenGtmToolCallResultSchema>
export type OpenGtmToolCallEnvelope = z.infer<typeof OpenGtmToolCallEnvelopeSchema>

// Backwards-compatible aliases for existing minimal exports.
export const OpenGtmToolCallSchema = OpenGtmToolCallRequestSchema
export const OpenGtmToolResultSchema = OpenGtmToolCallResultSchema

export function validateToolCallRequest(input: unknown) {
  return validateWithSchema(OpenGtmToolCallRequestSchema, input)
}

export function validateToolCallResult(input: unknown) {
  return validateWithSchema(OpenGtmToolCallResultSchema, input)
}

export function validateToolCallEnvelope(input: unknown) {
  return validateWithSchema(OpenGtmToolCallEnvelopeSchema, input)
}
