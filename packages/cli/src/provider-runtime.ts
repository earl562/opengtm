import {
  createMockProvider,
  createOpenAICompatibleProvider,
  type OpenGtmGenerateInput,
  type OpenGtmGenerateOutput,
  type OpenGtmProvider
} from '@opengtm/providers'
import type { OpenGtmLoopPhaseProviders } from '@opengtm/loop'
import { getProviderCatalogEntry, listModelsForProvider } from './catalog.js'
import { loadOpenGtmConfig } from './config.js'
import { getProviderApiKey } from './credentials.js'
import { refreshOpenAiOauthToken } from './oauth.js'
import { getProviderOauthTokens, setProviderOauthTokens } from './credentials.js'

export interface OpenGtmWorkspaceProviderResolution {
  providerId: string
  model: string
  authMode: 'none' | 'api-key' | 'oauth'
  configured: boolean
  provider: OpenGtmProvider
}

export interface OpenGtmWorkspaceGenerationResult extends OpenGtmGenerateOutput {
  providerId: string
  configured: boolean
  authMode: 'none' | 'api-key' | 'oauth'
}

export interface OpenGtmWorkspacePhaseProviderResolution {
  providerId: string
  configured: boolean
  authMode: 'none' | 'api-key' | 'oauth'
  phaseModels: {
    plan: string
    observe: string
    act: string
    reflect: string
  }
  phaseProviders: OpenGtmLoopPhaseProviders
}

export async function resolveWorkspaceProvider(cwd: string): Promise<OpenGtmWorkspaceProviderResolution> {
  return resolveWorkspaceProviderSelection({ cwd })
}

export async function resolveWorkspacePhaseProviders(cwd: string): Promise<OpenGtmWorkspacePhaseProviderResolution> {
  const config = await loadOpenGtmConfig(cwd)
  const primary = await resolveWorkspaceProviderSelection({ cwd })
  const phaseModels = selectPhaseModels(
    primary.providerId,
    primary.model,
    config?.preferences?.phaseModels
  )

  const uniqueModels = Array.from(new Set(Object.values(phaseModels)))
  const perModel = new Map<string, OpenGtmWorkspaceProviderResolution>()
  for (const model of uniqueModels) {
    perModel.set(model, await resolveWorkspaceProviderSelection({
      cwd,
      providerIdOverride: primary.providerId === 'mock' ? undefined : primary.providerId,
      modelOverride: primary.providerId === 'mock' ? undefined : model
    }))
  }

  return {
    providerId: primary.providerId,
    configured: primary.configured,
    authMode: primary.authMode,
    phaseModels,
    phaseProviders: {
      default: perModel.get(phaseModels.act)?.provider || primary.provider,
      plan: perModel.get(phaseModels.plan)?.provider || primary.provider,
      observe: perModel.get(phaseModels.observe)?.provider || primary.provider,
      act: perModel.get(phaseModels.act)?.provider || primary.provider,
      reflect: perModel.get(phaseModels.reflect)?.provider || primary.provider
    }
  }
}

async function resolveWorkspaceProviderSelection(args: {
  cwd: string
  providerIdOverride?: string
  modelOverride?: string
}): Promise<OpenGtmWorkspaceProviderResolution> {
  const config = await loadOpenGtmConfig(args.cwd)
  const currentProvider = args.providerIdOverride || config?.preferences?.currentProvider || 'mock'
  const currentModel = args.modelOverride || config?.preferences?.currentModel || (currentProvider === 'mock' ? 'mock-0' : 'gpt-5.2')
  const auth = config?.auth?.[currentProvider] || null
  const providerEntry = getProviderCatalogEntry(currentProvider)

  if (currentProvider === 'mock' || !providerEntry || providerEntry.kind === 'mock') {
    return {
      providerId: 'mock',
      model: currentModel || 'mock-0',
      authMode: 'none',
      configured: true,
      provider: createMockProvider({
        id: 'mock',
        seed: `opengtm:${currentModel || 'mock-0'}`
      })
    }
  }

  const baseURL = config?.providers?.[currentProvider]?.baseURL || providerEntry.baseURL
  const apiKey = await resolveApiKey({
    cwd: args.cwd,
    providerId: currentProvider,
    auth
  })

  if (!baseURL || !apiKey) {
    return {
      providerId: 'mock',
      model: 'mock-0',
      authMode: 'none',
      configured: false,
      provider: createMockProvider({
        id: 'mock-fallback',
        seed: `opengtm:fallback:${currentProvider}`
      })
    }
  }

  return {
    providerId: currentProvider,
    model: currentModel,
    authMode: auth?.authMode === 'oauth' ? 'oauth' : 'api-key',
    configured: true,
    provider: createOpenAICompatibleProvider({
      id: currentProvider,
      baseURL,
      apiKey,
      model: currentModel
    })
  }
}

export async function generateWithWorkspaceProvider(args: {
  cwd: string
  input: OpenGtmGenerateInput
}): Promise<OpenGtmWorkspaceGenerationResult> {
  const resolved = await resolveWorkspaceProvider(args.cwd)
  const output = await resolved.provider.generate(args.input)
  return {
    ...output,
    providerId: resolved.providerId,
    configured: resolved.configured,
    authMode: resolved.authMode
  }
}

async function resolveApiKey(args: {
  cwd: string
  providerId: string
  auth: { backend?: 'local-file' | 'env' | 'oauth-pkce'; envVar?: string | null; authMode?: 'none' | 'api-key' | 'oauth' } | null
}) {
  if (args.auth?.backend === 'oauth-pkce' || args.auth?.authMode === 'oauth') {
    const oauth = await getProviderOauthTokens(args.cwd, args.providerId)
    if (!oauth) return null

    const expiresAt = oauth.expiresAt ? Date.parse(oauth.expiresAt) : NaN
    const refreshable = oauth.refreshToken && Number.isFinite(expiresAt) && expiresAt <= Date.now() + 120000
    if (!refreshable) {
      return oauth.accessToken
    }

    const refreshed = await refreshOpenAiOauthToken(oauth.refreshToken as string)
    await setProviderOauthTokens(args.cwd, args.providerId, refreshed)
    return refreshed.accessToken
  }

  if (args.auth?.backend === 'env' && args.auth.envVar) {
    return process.env[args.auth.envVar] || null
  }

  return getProviderApiKey(args.cwd, args.providerId)
}

function selectPhaseModels(
  providerId: string,
  currentModel: string,
  overrides?: {
    plan?: string
    observe?: string
    act?: string
    reflect?: string
  }
) {
  if (providerId !== 'openai') {
    const singleModel = {
      plan: currentModel,
      observe: currentModel,
      act: currentModel,
      reflect: currentModel
    }
    return {
      ...singleModel,
      ...(overrides?.plan ? { plan: overrides.plan } : {}),
      ...(overrides?.observe ? { observe: overrides.observe } : {}),
      ...(overrides?.act ? { act: overrides.act } : {}),
      ...(overrides?.reflect ? { reflect: overrides.reflect } : {})
    }
  }

  const available = listModelsForProvider(providerId, currentModel)
  const supportModel = available.includes('gpt-5-mini') && currentModel !== 'gpt-5-mini'
    ? 'gpt-5-mini'
    : currentModel

  return {
    plan: overrides?.plan || supportModel,
    observe: overrides?.observe || supportModel,
    act: overrides?.act || currentModel,
    reflect: overrides?.reflect || supportModel
  }
}
