import type { OpenGtmConfig } from '../config.js'
import { updateOpenGtmConfig } from '../config.js'
import { getProviderCatalogEntry } from '../catalog.js'
import {
  clearProviderAuth,
  clearProviderApiKey,
  clearProviderPendingPkce,
  getProviderPendingPkce,
  maskSecret,
  setProviderApiKey,
  setProviderOauthTokens,
  type OpenGtmOAuthTokenRecord
} from '../credentials.js'
import {
  createOpenAiOauthStart,
  exchangeOpenAiOauthCode,
  openSystemBrowser,
  parseOauthRedirect
} from '../oauth.js'
import { setProviderPendingPkce } from '../credentials.js'

export async function handleAuth(args: {
  cwd: string
  config: OpenGtmConfig | null
  action: 'status' | 'login' | 'logout'
  providerId?: string
  apiKey?: string
  apiKeyEnv?: string
  baseURL?: string
  oauthRedirectUrl?: string
  noOpen?: boolean
  callbackPort?: number
}) {
  if (!args.config) {
    throw new Error('No workspace config found. Run "opengtm init" before configuring auth.')
  }

  const providerId = args.providerId || args.config.preferences?.currentProvider || 'openai'
  const provider = getProviderCatalogEntry(providerId)
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`)
  }

  const currentAuth = args.config.auth?.[providerId] || null

  if (args.action === 'status') {
    const pendingPkce = await getProviderPendingPkce(args.cwd, providerId)
    const effectiveMode = currentAuth?.configured ? currentAuth.authMode : provider.authMode
    return {
      kind: 'auth',
      action: 'status',
      provider: {
        id: provider.id,
        label: provider.label,
        authMode: effectiveMode
      },
      configured: effectiveMode === 'none' ? true : Boolean(currentAuth?.configured),
      backend: currentAuth?.backend || (pendingPkce ? 'oauth-pkce' : effectiveMode === 'none' ? 'none' : 'unconfigured'),
      maskedValue: currentAuth?.maskedValue || null,
      envVar: currentAuth?.envVar || null,
      accountId: currentAuth?.accountId || null,
      authUrl: pendingPkce?.authUrl || null,
      redirectUri: pendingPkce?.redirectUri || null,
      nextAction: effectiveMode === 'none'
        ? 'This provider does not require authentication.'
        : currentAuth?.configured
          ? 'Authentication is configured. You can now select the provider/model and run workflows.'
          : pendingPkce
            ? `Finish login, then run \`opengtm auth login ${provider.id} --oauth-redirect-url="${pendingPkce.redirectUri}?code=...&state=${pendingPkce.state}"\`.`
          : effectiveMode === 'oauth'
            ? `Run \`opengtm auth login ${provider.id}\` to start the PKCE login flow.`
            : `Run \`opengtm auth login ${provider.id} --api-key=...\` or \`--api-key-env=ENV_VAR\`.`
    }
  }

  if (provider.authMode === 'none') {
    throw new Error(`Provider ${provider.id} does not require authentication.`)
  }

  if (args.action === 'logout') {
    await clearProviderAuth(args.cwd, providerId)
    const nextConfig = await updateOpenGtmConfig(args.cwd, (config) => ({
      ...config,
      auth: {
        ...(config.auth || {}),
        [providerId]: {
          providerId,
          authMode: provider.authMode,
          backend: provider.authMode === 'oauth' ? 'oauth-pkce' : 'local-file',
          configured: false,
          maskedValue: null,
          envVar: null,
          accountId: null,
          configuredAt: null
        }
      }
    }))

    return {
      kind: 'auth',
      action: 'logout',
      provider: {
        id: provider.id,
        label: provider.label,
        authMode: provider.authMode
      },
      configured: false,
      backend: nextConfig.auth?.[providerId]?.backend || 'local-file',
      maskedValue: null,
      envVar: null,
      accountId: null,
      nextAction: `Authentication cleared for ${provider.label}.`
    }
  }

  if (args.apiKey || args.apiKeyEnv) {
    return finalizeApiKeyLogin(args, provider)
  }

  if (provider.id === 'openai') {
    if (args.oauthRedirectUrl) {
      return finalizeOpenAiOauthLogin({
        cwd: args.cwd,
        oauthRedirectUrl: args.oauthRedirectUrl
      }, provider)
    }
    return beginOpenAiOauthLogin({
      cwd: args.cwd,
      callbackPort: args.callbackPort,
      noOpen: args.noOpen
    }, provider)
  }

  throw new Error('Auth login requires either --api-key=... or --api-key-env=ENV_VAR.')
}

async function finalizeApiKeyLogin(
  args: {
    cwd: string
    apiKey?: string
    apiKeyEnv?: string
    baseURL?: string
  },
  provider: NonNullable<ReturnType<typeof getProviderCatalogEntry>>
) {
  const maskedValue = args.apiKey ? maskSecret(args.apiKey) : `env:${args.apiKeyEnv}`
  if (args.apiKey) {
    await setProviderApiKey(args.cwd, provider.id, args.apiKey)
  } else {
    await clearProviderApiKey(args.cwd, provider.id)
  }

  const nextConfig = await updateOpenGtmConfig(args.cwd, (config) => ({
    ...config,
    providers: {
      ...(config.providers || {}),
      [provider.id]: {
        ...(config.providers?.[provider.id] || {
          id: provider.id,
          label: provider.label,
          kind: provider.kind,
          supportTier: provider.supportTier,
          authMode: 'api-key',
          baseURL: provider.baseURL
        }),
        authMode: 'api-key',
        ...(args.baseURL ? { baseURL: args.baseURL } : {})
      }
    },
    auth: {
      ...(config.auth || {}),
      [provider.id]: {
        providerId: provider.id,
        authMode: 'api-key',
        backend: args.apiKeyEnv ? 'env' : 'local-file',
        configured: true,
        maskedValue,
        envVar: args.apiKeyEnv || null,
        accountId: null,
        configuredAt: new Date().toISOString()
      }
    }
  }))

  return {
    kind: 'auth',
    action: 'login',
    provider: {
      id: provider.id,
      label: provider.label,
      authMode: 'api-key'
    },
    configured: true,
    backend: nextConfig.auth?.[provider.id]?.backend || 'local-file',
    maskedValue,
    envVar: args.apiKeyEnv || null,
    accountId: null,
    nextAction: `Authentication configured for ${provider.label}. Use \`opengtm provider use ${provider.id}\` or \`opengtm models list\` next.`
  }
}

async function beginOpenAiOauthLogin(
  args: {
    cwd: string
    callbackPort?: number
    noOpen?: boolean
  },
  provider: NonNullable<ReturnType<typeof getProviderCatalogEntry>>
) {
  const pending = createOpenAiOauthStart({
    callbackPort: args.callbackPort
  })

  await setProviderPendingPkce(args.cwd, provider.id, {
    state: pending.state,
    verifier: pending.verifier,
    redirectUri: pending.redirectUri,
    authUrl: pending.authUrl,
    createdAt: new Date().toISOString()
  })

  if (!args.noOpen) {
    await openSystemBrowser(pending.authUrl)
  }

  return {
    kind: 'auth',
    action: 'login',
    provider: {
      id: provider.id,
      label: provider.label,
      authMode: 'oauth'
    },
    configured: false,
    backend: 'oauth-pkce',
    maskedValue: null,
    envVar: null,
    accountId: null,
    authUrl: pending.authUrl,
    redirectUri: pending.redirectUri,
    nextAction: `Open the URL above, finish login, then run \`opengtm auth login ${provider.id} --oauth-redirect-url="${pending.redirectUri}?code=...&state=${pending.state}"\` to complete the exchange.`
  }
}

async function finalizeOpenAiOauthLogin(
  args: {
    cwd: string
    oauthRedirectUrl: string
  },
  provider: NonNullable<ReturnType<typeof getProviderCatalogEntry>>
) {
  const pending = await getProviderPendingPkce(args.cwd, provider.id)
  if (!pending) {
    throw new Error(`No pending OAuth login found. Run \`opengtm auth login ${provider.id}\` first.`)
  }

  const parsed = parseOauthRedirect(args.oauthRedirectUrl)
  if (parsed.error) {
    throw new Error(`OpenAI OAuth returned ${parsed.error}: ${parsed.errorDescription || 'no description provided'}`)
  }
  if (!parsed.code) {
    throw new Error('OAuth redirect URL does not include a code parameter.')
  }
  if (parsed.state !== pending.state) {
    throw new Error('OAuth state mismatch. Start the login flow again.')
  }

  const exchanged = await exchangeOpenAiOauthCode({
    code: parsed.code,
    verifier: pending.verifier,
    redirectUri: pending.redirectUri
  })

  await setProviderOauthTokens(args.cwd, provider.id, exchanged)
  await clearProviderPendingPkce(args.cwd, provider.id)

  const nextConfig = await updateOpenGtmConfig(args.cwd, (config) => ({
    ...config,
    auth: {
      ...(config.auth || {}),
      [provider.id]: {
        providerId: provider.id,
        authMode: 'oauth',
        backend: 'oauth-pkce',
        configured: true,
        maskedValue: maskOauthIdentity(exchanged),
        envVar: null,
        accountId: exchanged.accountId,
        configuredAt: new Date().toISOString()
      }
    },
    providers: {
      ...(config.providers || {}),
      [provider.id]: {
        ...(config.providers?.[provider.id] || {
          id: provider.id,
          label: provider.label,
          kind: provider.kind,
          supportTier: provider.supportTier,
          authMode: 'oauth',
          baseURL: provider.baseURL
        }),
        authMode: 'oauth'
      }
    }
  }))

  return {
    kind: 'auth',
    action: 'login',
    provider: {
      id: provider.id,
      label: provider.label,
      authMode: 'oauth'
    },
    configured: true,
    backend: nextConfig.auth?.[provider.id]?.backend || 'oauth-pkce',
    maskedValue: nextConfig.auth?.[provider.id]?.maskedValue || null,
    envVar: null,
    accountId: exchanged.accountId,
    nextAction: `OAuth configured for ${provider.label}. Use \`opengtm provider use ${provider.id}\` or \`opengtm models list\` next.`
  }
}

function maskOauthIdentity(tokens: OpenGtmOAuthTokenRecord | Omit<OpenGtmOAuthTokenRecord, 'updatedAt'>) {
  if (tokens.accountId) {
    return `acct:${tokens.accountId}`
  }
  return `oauth:${maskSecret(tokens.accessToken)}`
}
