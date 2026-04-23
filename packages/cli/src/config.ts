import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { OpenGtmAutonomyMode } from './autonomy.js'
import { listProviderCatalog, type OpenGtmProviderAuthMode, type OpenGtmProviderKind } from './catalog.js'

export interface OpenGtmProviderProfile {
  id: string
  label: string
  kind: OpenGtmProviderKind
  supportTier: 'stable' | 'experimental'
  authMode: OpenGtmProviderAuthMode
  baseURL: string | null
}

export interface OpenGtmAuthProfile {
  providerId: string
  authMode: 'none' | 'api-key' | 'oauth'
  backend: 'local-file' | 'env' | 'oauth-pkce'
  configured: boolean
  maskedValue: string | null
  envVar: string | null
  accountId?: string | null
  configuredAt: string | null
}

export interface OpenGtmPhaseModelPreferences {
  plan?: string
  observe?: string
  act?: string
  reflect?: string
}

export interface OpenGtmOperatorPreferences {
  outputMode: 'human' | 'json'
  currentProvider: string
  currentModel: string
  sandboxProfile: string
  phaseModels?: OpenGtmPhaseModelPreferences
}

export interface OpenGtmConfig {
  runtimeDir: string
  workspaceId: string
  initiativeId: string
  workspaceName: string
  initiativeTitle: string
  workspaceRoot: string
  autonomyMode?: OpenGtmAutonomyMode
  providers?: Record<string, OpenGtmProviderProfile>
  auth?: Record<string, OpenGtmAuthProfile>
  preferences?: OpenGtmOperatorPreferences
}

export const DEFAULT_RUNTIME_DIR = '.opengtm/runtime'
export const DEFAULT_CONFIG_PATH = '.opengtm/config.json'
export const DEFAULT_SANDBOX_PROFILE = 'read-only'

function normalizePhaseModelPreferences(
  phaseModels: OpenGtmPhaseModelPreferences | null | undefined
): OpenGtmPhaseModelPreferences | undefined {
  const normalized: OpenGtmPhaseModelPreferences = {}
  for (const key of ['plan', 'observe', 'act', 'reflect'] as const) {
    const value = phaseModels?.[key]
    if (typeof value === 'string' && value.trim()) {
      normalized[key] = value.trim()
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function getDefaultProviderProfiles(): Record<string, OpenGtmProviderProfile> {
  return listProviderCatalog().reduce<Record<string, OpenGtmProviderProfile>>((profiles, provider) => {
    profiles[provider.id] = {
      id: provider.id,
      label: provider.label,
      kind: provider.kind,
      supportTier: provider.supportTier,
      authMode: provider.authMode,
      baseURL: provider.baseURL
    }
    return profiles
  }, {})
}

export function normalizeOpenGtmConfig(config: OpenGtmConfig): OpenGtmConfig {
  const defaultProviders = getDefaultProviderProfiles()
  const providers = {
    ...defaultProviders,
    ...(config.providers || {})
  }
  const currentProvider = config.preferences?.currentProvider || 'mock'
  const providerDefaultModel = currentProvider === 'openai'
    ? 'gpt-5.2'
    : currentProvider === 'mock'
      ? 'mock-0'
      : 'custom'

  return {
    ...config,
    runtimeDir: config.runtimeDir || DEFAULT_RUNTIME_DIR,
    providers,
    auth: config.auth || {},
    preferences: {
      outputMode: config.preferences?.outputMode || 'human',
      currentProvider,
      currentModel: config.preferences?.currentModel || providerDefaultModel,
      sandboxProfile: config.preferences?.sandboxProfile || DEFAULT_SANDBOX_PROFILE,
      ...(normalizePhaseModelPreferences(config.preferences?.phaseModels)
        ? { phaseModels: normalizePhaseModelPreferences(config.preferences?.phaseModels) }
        : {})
    }
  }
}

export async function loadOpenGtmConfig(cwd: string): Promise<OpenGtmConfig | null> {
  try {
    const content = await readFile(path.join(cwd, DEFAULT_CONFIG_PATH), 'utf-8')
    return normalizeOpenGtmConfig(JSON.parse(content))
  } catch {
    return null
  }
}

export async function saveOpenGtmConfig(cwd: string, config: OpenGtmConfig): Promise<void> {
  await mkdir(path.join(cwd, '.opengtm'), { recursive: true })
  await writeFile(
    path.join(cwd, DEFAULT_CONFIG_PATH),
    JSON.stringify(normalizeOpenGtmConfig(config), null, 2),
    'utf-8'
  )
}

export async function updateOpenGtmConfig(
  cwd: string,
  update: (config: OpenGtmConfig) => OpenGtmConfig
): Promise<OpenGtmConfig> {
  const current = await loadOpenGtmConfig(cwd)
  if (!current) {
    throw new Error('No workspace config found. Run "opengtm init" first.')
  }

  const next = normalizeOpenGtmConfig(update(current))
  await saveOpenGtmConfig(cwd, next)
  return next
}
