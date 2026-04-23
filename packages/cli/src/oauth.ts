import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'

export interface OpenGtmOpenAiOauthStart {
  authUrl: string
  state: string
  verifier: string
  redirectUri: string
}

export interface OpenGtmOpenAiOauthTokenResponse {
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  accountId: string | null
}

export const OPENAI_CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const OPENAI_CODEX_OAUTH_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
export const OPENAI_CODEX_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token'

function base64UrlEncode(input: Buffer) {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function createPkceVerifier() {
  return base64UrlEncode(randomBytes(48))
}

function createPkceChallenge(verifier: string) {
  return base64UrlEncode(createHash('sha256').update(verifier).digest())
}

export function createOpenAiOauthStart(args: {
  callbackPort?: number
}) {
  const callbackPort = args.callbackPort || 1455
  const state = base64UrlEncode(randomBytes(16))
  const verifier = createPkceVerifier()
  const challenge = createPkceChallenge(verifier)
  const redirectUri = `http://127.0.0.1:${callbackPort}/auth/callback`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OPENAI_CODEX_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state
  })

  return {
    authUrl: `${OPENAI_CODEX_OAUTH_AUTHORIZE_URL}?${params.toString()}`,
    state,
    verifier,
    redirectUri
  } satisfies OpenGtmOpenAiOauthStart
}

export function parseOauthRedirect(input: string) {
  const url = new URL(input)
  return {
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    error: url.searchParams.get('error'),
    errorDescription: url.searchParams.get('error_description')
  }
}

function extractAccountIdFromJwt(accessToken: string) {
  try {
    const parts = accessToken.split('.')
    if (parts.length < 2) return null
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<string, unknown>
    const direct = payload.account_id || payload.accountId || payload.sub
    return typeof direct === 'string' ? direct : null
  } catch {
    return null
  }
}

function resolveExpiresAt(expiresIn: unknown) {
  const numeric = typeof expiresIn === 'number' ? expiresIn : Number(expiresIn)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return new Date(Date.now() + numeric * 1000).toISOString()
}

export async function exchangeOpenAiOauthCode(args: {
  code: string
  verifier: string
  redirectUri: string
}) {
  const response = await fetch(OPENAI_CODEX_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OPENAI_CODEX_OAUTH_CLIENT_ID,
      code: args.code,
      redirect_uri: args.redirectUri,
      code_verifier: args.verifier
    })
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`OpenAI OAuth exchange failed (${response.status}): ${raw.slice(0, 500)}`)
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>
  const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : ''
  if (!accessToken) {
    throw new Error('OpenAI OAuth exchange did not return an access token.')
  }

  return {
    accessToken,
    refreshToken: typeof parsed.refresh_token === 'string' ? parsed.refresh_token : null,
    expiresAt: resolveExpiresAt(parsed.expires_in),
    accountId: extractAccountIdFromJwt(accessToken)
  } satisfies OpenGtmOpenAiOauthTokenResponse
}

export async function refreshOpenAiOauthToken(refreshToken: string) {
  const response = await fetch(OPENAI_CODEX_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: OPENAI_CODEX_OAUTH_CLIENT_ID,
      refresh_token: refreshToken
    })
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`OpenAI OAuth refresh failed (${response.status}): ${raw.slice(0, 500)}`)
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>
  const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : ''
  if (!accessToken) {
    throw new Error('OpenAI OAuth refresh did not return an access token.')
  }

  return {
    accessToken,
    refreshToken: typeof parsed.refresh_token === 'string' ? parsed.refresh_token : refreshToken,
    expiresAt: resolveExpiresAt(parsed.expires_in),
    accountId: extractAccountIdFromJwt(accessToken)
  } satisfies OpenGtmOpenAiOauthTokenResponse
}

export async function openSystemBrowser(url: string) {
  const platform = process.platform
  const command = platform === 'darwin'
    ? 'open'
    : platform === 'win32'
      ? 'cmd'
      : 'xdg-open'
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url]

  await new Promise<void>((resolve) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore'
    })
    child.on('error', () => resolve())
    child.unref()
    resolve()
  })
}
