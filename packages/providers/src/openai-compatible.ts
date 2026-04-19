import type { OpenGtmGenerateInput, OpenGtmGenerateOutput, OpenGtmProvider } from './types.js'

export interface OpenAICompatibleProviderOptions {
  baseURL: string
  apiKey: string
  model: string
  id?: string
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
}

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OpenAIChatRequest {
  model: string
  messages: OpenAIChatMessage[]
  temperature?: number
  max_tokens?: number
}

interface OpenAIChatResponse {
  model?: string
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export class OpenAICompatibleProviderError extends Error {
  readonly status: number
  readonly providerId: string
  readonly body: string

  constructor(providerId: string, status: number, body: string) {
    super(`${providerId} responded with HTTP ${status}: ${body.slice(0, 500)}`)
    this.name = 'OpenAICompatibleProviderError'
    this.providerId = providerId
    this.status = status
    this.body = body
  }
}

export function createOpenAICompatibleProvider(
  options: OpenAICompatibleProviderOptions
): OpenGtmProvider {
  const id = options.id ?? `openai-compat:${options.model}`
  const doFetch = options.fetch ?? globalThis.fetch

  if (typeof doFetch !== 'function') {
    throw new Error(
      `createOpenAICompatibleProvider: no fetch available. Provide options.fetch or run on Node >= 18.`
    )
  }

  const endpoint = joinUrl(options.baseURL, '/chat/completions')

  return {
    id,
    async generate(input: OpenGtmGenerateInput): Promise<OpenGtmGenerateOutput> {
      const messages: OpenAIChatMessage[] = []
      if (input.system) messages.push({ role: 'system', content: input.system })
      messages.push({ role: 'user', content: input.prompt })

      const body: OpenAIChatRequest = {
        model: options.model,
        messages,
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {})
      }

      const response = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
          ...options.headers
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errText = await safeReadBody(response)
        throw new OpenAICompatibleProviderError(id, response.status, errText)
      }

      const parsed = (await response.json()) as OpenAIChatResponse
      const text = parsed.choices?.[0]?.message?.content ?? ''
      const model = parsed.model ?? options.model
      const inputTokens = parsed.usage?.prompt_tokens ?? 0
      const outputTokens = parsed.usage?.completion_tokens ?? 0

      return {
        text,
        model,
        tokens: { input: inputTokens, output: outputTokens }
      }
    }
  }
}

function joinUrl(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, '')
  const trimmedPath = path.replace(/^\/+/, '')
  return `${trimmedBase}/${trimmedPath}`
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return '<unreadable body>'
  }
}
