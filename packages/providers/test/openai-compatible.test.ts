import { describe, expect, it } from 'vitest'
import {
  createOpenAICompatibleProvider,
  OpenAICompatibleProviderError
} from '../src/index.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

describe('providers: openai-compatible', () => {
  it('sends system+user messages and parses content/usage', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined

    const fakeFetch: typeof globalThis.fetch = async (url, init) => {
      capturedUrl = String(url)
      capturedInit = init
      return jsonResponse(200, {
        model: 'some-model-v1',
        choices: [{ message: { content: 'hello world' } }],
        usage: { prompt_tokens: 12, completion_tokens: 7 }
      })
    }

    const provider = createOpenAICompatibleProvider({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'test-key',
      model: 'some-model',
      fetch: fakeFetch
    })

    const out = await provider.generate({
      system: 'you are a test',
      prompt: 'say hello',
      temperature: 0.2,
      maxTokens: 50
    })

    expect(out.text).toBe('hello world')
    expect(out.model).toBe('some-model-v1')
    expect(out.tokens).toEqual({ input: 12, output: 7 })
    expect(capturedUrl).toBe('https://api.example.com/v1/chat/completions')

    const body = JSON.parse(String(capturedInit?.body))
    expect(body.model).toBe('some-model')
    expect(body.messages).toEqual([
      { role: 'system', content: 'you are a test' },
      { role: 'user', content: 'say hello' }
    ])
    expect(body.temperature).toBe(0.2)
    expect(body.max_tokens).toBe(50)

    const headers = capturedInit?.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer test-key')
    expect(headers['content-type']).toBe('application/json')
  })

  it('omits temperature and max_tokens when not provided', async () => {
    let capturedBody: Record<string, unknown> = {}
    const fakeFetch: typeof globalThis.fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body))
      return jsonResponse(200, {
        choices: [{ message: { content: 'ok' } }]
      })
    }

    const provider = createOpenAICompatibleProvider({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'k',
      model: 'm',
      fetch: fakeFetch
    })

    await provider.generate({ prompt: 'p' })

    expect(capturedBody).not.toHaveProperty('temperature')
    expect(capturedBody).not.toHaveProperty('max_tokens')
  })

  it('includes only user message when system is absent', async () => {
    let capturedBody: Record<string, unknown> = {}
    const fakeFetch: typeof globalThis.fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body))
      return jsonResponse(200, { choices: [{ message: { content: 'ok' } }] })
    }

    const provider = createOpenAICompatibleProvider({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'k',
      model: 'm',
      fetch: fakeFetch
    })

    await provider.generate({ prompt: 'hi' })

    expect(capturedBody.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('throws OpenAICompatibleProviderError on non-2xx', async () => {
    const fakeFetch: typeof globalThis.fetch = async () =>
      new Response('rate limit exceeded', { status: 429 })

    const provider = createOpenAICompatibleProvider({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'k',
      model: 'm',
      id: 'custom-id',
      fetch: fakeFetch
    })

    await expect(provider.generate({ prompt: 'x' })).rejects.toMatchObject({
      name: 'OpenAICompatibleProviderError',
      status: 429,
      providerId: 'custom-id'
    })
  })

  it('normalizes trailing slash on baseURL', async () => {
    let capturedUrl = ''
    const fakeFetch: typeof globalThis.fetch = async (url) => {
      capturedUrl = String(url)
      return jsonResponse(200, { choices: [{ message: { content: '' } }] })
    }

    const provider = createOpenAICompatibleProvider({
      baseURL: 'https://api.example.com/v1/',
      apiKey: 'k',
      model: 'm',
      fetch: fakeFetch
    })

    await provider.generate({ prompt: 'x' })

    expect(capturedUrl).toBe('https://api.example.com/v1/chat/completions')
  })

  it('defaults id from model when not provided', () => {
    const provider = createOpenAICompatibleProvider({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'k',
      model: 'some-model',
      fetch: async () => new Response('')
    })

    expect(provider.id).toBe('openai-compat:some-model')
  })

  it('forwards extra headers', async () => {
    let capturedHeaders: Record<string, string> = {}
    const fakeFetch: typeof globalThis.fetch = async (_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>
      return jsonResponse(200, { choices: [{ message: { content: '' } }] })
    }

    const provider = createOpenAICompatibleProvider({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'k',
      model: 'm',
      headers: {
        'http-referer': 'https://github.com/earl562/opengtm',
        'x-title': 'OpenGTM'
      },
      fetch: fakeFetch
    })

    await provider.generate({ prompt: 'x' })

    expect(capturedHeaders['http-referer']).toBe('https://github.com/earl562/opengtm')
    expect(capturedHeaders['x-title']).toBe('OpenGTM')
  })

  it('tolerates missing usage and falls back to zero tokens', async () => {
    const fakeFetch: typeof globalThis.fetch = async () =>
      jsonResponse(200, {
        model: 'm',
        choices: [{ message: { content: 'hi' } }]
      })

    const provider = createOpenAICompatibleProvider({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'k',
      model: 'm',
      fetch: fakeFetch
    })

    const out = await provider.generate({ prompt: 'p' })

    expect(out.tokens).toEqual({ input: 0, output: 0 })
  })
})
