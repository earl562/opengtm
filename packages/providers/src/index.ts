export interface OpenGtmGenerateInput {
  system?: string
  prompt: string
  temperature?: number
  maxTokens?: number
}

export interface OpenGtmGenerateOutput {
  text: string
  model: string
  tokens: {
    input: number
    output: number
  }
  costUsd?: number
}

export interface OpenGtmProvider {
  id: string
  generate(input: OpenGtmGenerateInput): Promise<OpenGtmGenerateOutput>
}

export function createMockProvider({ id = 'mock', seed = 'opengtm' }: { id?: string; seed?: string } = {}): OpenGtmProvider {
  return {
    id,
    async generate(input) {
      // Deterministic pseudo-response for CI
      const base = `${seed}:${input.prompt}`
      const hash = Array.from(base).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7)
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
