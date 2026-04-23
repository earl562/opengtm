import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCliRouter } from '../src/router.js'
import { loadAuthStore } from '../src/credentials.js'
import { resolveWorkspaceProvider } from '../src/provider-runtime.js'

describe('openai oauth auth flow', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('starts a PKCE login flow and persists pending state', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-oauth-start-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=OAuth Demo', '--initiative=Auth'])
    const result = await router(['auth', 'login', 'openai', '--no-open']) as any

    expect(result.provider.authMode).toBe('oauth')
    expect(result.backend).toBe('oauth-pkce')
    expect(result.authUrl).toContain('https://auth.openai.com/oauth/authorize')
    const store = await loadAuthStore(cwd)
    expect(store.providers.openai?.pendingPkce?.state).toBeTruthy()
    expect(store.providers.openai?.pendingPkce?.verifier).toBeTruthy()
  })

  it('completes OAuth exchange, stores tokens, and resolves openai provider in oauth mode', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opengtm-oauth-complete-'))
    const router = createCliRouter({ cwd })

    await router(['init', '--name=OAuth Demo', '--initiative=Auth'])
    const started = await router(['auth', 'login', 'openai', '--no-open']) as any
    const authUrl = new URL(started.authUrl)
    const state = authUrl.searchParams.get('state')
    expect(state).toBeTruthy()

    global.fetch = (async () => ({
      ok: true,
      async text() {
        return JSON.stringify({
          access_token: 'header.eyJhY2NvdW50SWQiOiJhY2N0X3Rlc3QifQ.signature',
          refresh_token: 'refresh-test-token',
          expires_in: 3600
        })
      }
    })) as unknown as typeof global.fetch

    const result = await router([
      'auth',
      'login',
      'openai',
      `--oauth-redirect-url=http://127.0.0.1:1455/auth/callback?code=test-code&state=${state}`
    ]) as any

    expect(result.configured).toBe(true)
    expect(result.provider.authMode).toBe('oauth')
    expect(result.backend).toBe('oauth-pkce')

    const store = await loadAuthStore(cwd)
    expect(store.providers.openai?.oauth?.accessToken).toContain('header.')
    expect(store.providers.openai?.pendingPkce).toBeUndefined()

    await router(['provider', 'use', 'openai'])
    await router(['models', 'use', 'gpt-5.2'])
    const resolved = await resolveWorkspaceProvider(cwd)
    expect(resolved.providerId).toBe('openai')
    expect(resolved.authMode).toBe('oauth')
    expect(resolved.configured).toBe(true)
  })
})
