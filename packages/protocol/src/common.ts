import { z } from 'zod'

export const OpenGtmIsoDateSchema = z.string().datetime()

export const OpenGtmEnvelopeIdSchema = z.string().min(1)

export const OpenGtmProtocolVersionSchema = z.literal('1.0')

export const OpenGtmProtocolActorKindSchema = z.enum(['agent', 'tool', 'subagent', 'user', 'gateway', 'system'])

export const OpenGtmProtocolActorSchema = z.object({
  kind: OpenGtmProtocolActorKindSchema,
  id: z.string().min(1),
  label: z.string().min(1).optional()
})

export const OpenGtmProtocolContextSchema = z.object({
  sessionId: z.string().min(1).optional(),
  workItemId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
  lane: z.string().min(1).optional()
}).default({})

export const OpenGtmPermissionTrustLevelSchema = z.enum(['internal', 'trusted-external', 'untrusted-external'])

export const OpenGtmPermissionSandboxSchema = z.enum(['read-only', 'workspace-write', 'connector-write', 'human-review'])

export const OpenGtmPermissionBoundarySchema = z.object({
  approvalRequired: z.boolean().default(false),
  trustLevel: OpenGtmPermissionTrustLevelSchema.default('internal'),
  sandbox: OpenGtmPermissionSandboxSchema.default('read-only'),
  scopes: z.array(z.string().min(1)).default([])
})

export const OpenGtmDiscoveryMetadataSchema = z.object({
  family: z.string().min(1),
  version: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([])
})

export const OpenGtmEnvelopeBaseSchema = z.object({
  id: OpenGtmEnvelopeIdSchema,
  version: OpenGtmProtocolVersionSchema.default('1.0'),
  createdAt: OpenGtmIsoDateSchema,
  source: OpenGtmProtocolActorSchema,
  target: OpenGtmProtocolActorSchema.optional(),
  context: OpenGtmProtocolContextSchema,
  boundary: OpenGtmPermissionBoundarySchema.default({}),
  discovery: OpenGtmDiscoveryMetadataSchema.optional()
})

export type OpenGtmProtocolActor = z.infer<typeof OpenGtmProtocolActorSchema>
export type OpenGtmProtocolContext = z.infer<typeof OpenGtmProtocolContextSchema>
export type OpenGtmPermissionBoundary = z.infer<typeof OpenGtmPermissionBoundarySchema>
export type OpenGtmDiscoveryMetadata = z.infer<typeof OpenGtmDiscoveryMetadataSchema>

export function validateWithSchema<T>(schema: z.ZodSchema<T>, input: unknown) {
  const result = schema.safeParse(input)
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
