import type { OpenGtmConfig } from '../config.js'
import { updateOpenGtmConfig } from '../config.js'
import { getProviderCatalogEntry, listModelsForProvider, listProviderCatalog } from '../catalog.js'

export async function handleProviders(args: {
  cwd: string
  config: OpenGtmConfig | null
  action: 'list' | 'use'
  providerId?: string
}) {
  if (!args.config) {
    throw new Error('No workspace config found. Run "opengtm init" before selecting a provider.')
  }

  if (args.action === 'list') {
    const currentProvider = args.config.preferences?.currentProvider || 'mock'
    return {
      kind: 'providers',
      action: 'list',
      currentProvider,
      providers: listProviderCatalog().map((provider) => ({
        id: provider.id,
        label: provider.label,
        description: provider.description,
        supportTier: provider.supportTier,
        authMode: provider.authMode,
        baseURL: args.config?.providers?.[provider.id]?.baseURL || provider.baseURL,
        configured: provider.authMode === 'none'
          ? true
          : Boolean(args.config?.auth?.[provider.id]?.configured)
      })),
      nextAction: 'Use `opengtm provider use <provider>` to switch the active provider profile.'
    }
  }

  if (!args.providerId) {
    throw new Error('Provider selection requires a provider id.')
  }

  const provider = getProviderCatalogEntry(args.providerId)
  if (!provider) {
    throw new Error(`Unknown provider: ${args.providerId}`)
  }

  const availableModels = listModelsForProvider(provider.id)
  const nextConfig = await updateOpenGtmConfig(args.cwd, (config) => ({
    ...config,
    preferences: {
      ...(config.preferences ?? {
        outputMode: 'human',
        currentProvider: 'mock',
        currentModel: 'mock-0',
        sandboxProfile: 'read-only'
      }),
      currentProvider: provider.id,
      currentModel: availableModels[0] || config.preferences?.currentModel || provider.defaultModel
    }
  }))

  return {
    kind: 'providers',
    action: 'use',
    currentProvider: nextConfig.preferences?.currentProvider || provider.id,
    providers: [
      {
        id: provider.id,
        label: provider.label,
        description: provider.description,
        supportTier: provider.supportTier,
        authMode: provider.authMode,
        baseURL: nextConfig.providers?.[provider.id]?.baseURL || provider.baseURL,
        configured: provider.authMode === 'none'
          ? true
          : Boolean(nextConfig.auth?.[provider.id]?.configured)
      }
    ],
    nextAction: `Provider switched to ${provider.label}. Use \`opengtm models list\` to review or change the active model.`
  }
}
