import { z } from 'zod'

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

export type OpenGtmTraceStep = z.infer<typeof OpenGtmTraceStepSchema>
export type OpenGtmTrace = z.infer<typeof OpenGtmTraceSchema>
