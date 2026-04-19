import type { OpenGtmGenerateInput, OpenGtmGenerateOutput, OpenGtmProvider } from './types.js'

export interface CreateMockProviderOptions {
  id?: string
  seed?: string
}

export function createMockProvider({
  id = 'mock',
  seed = 'opengtm'
}: CreateMockProviderOptions = {}): OpenGtmProvider {
  return {
    id,
    async generate(input: OpenGtmGenerateInput): Promise<OpenGtmGenerateOutput> {
      const base = `${seed}:${input.prompt}`
      const hash = Array.from(base).reduce(
        (acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0,
        7
      )
      const text = `MOCK_RESPONSE(${hash}): ${input.prompt.slice(0, 120)}`

      return {
        text,
        model: 'mock-0',
        tokens: {
          input: Math.min(2048, input.prompt.length),
          output: Math.min(2048, text.length)
        },
        costUsd: 0
      }
    }
  }
}
