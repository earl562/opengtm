import type { OpenGtmConfig } from '../config.js'
import { updateOpenGtmConfig } from '../config.js'
import { getProviderCatalogEntry, listModelsForProvider } from '../catalog.js'

export async function handleModels(args: {
  cwd: string
  config: OpenGtmConfig | null
  action: 'list' | 'use'
  providerId?: string
  modelId?: string
}) {
  if (!args.config) {
    throw new Error('No workspace config found. Run "opengtm init" before selecting models.')
  }

  const providerId = args.providerId || args.config.preferences?.currentProvider || 'mock'
  const provider = getProviderCatalogEntry(providerId)
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`)
  }

  const currentModel = args.config.preferences?.currentModel || provider.defaultModel
  const models = listModelsForProvider(providerId, currentModel)

  if (args.action === 'list') {
    return {
      kind: 'models',
      action: 'list',
      provider: {
        id: provider.id,
        label: provider.label
      },
      currentModel,
      models: models.map((id) => ({
        id,
        current: id === currentModel
      })),
      nextAction: 'Use `opengtm models use <model>` to change the active model for this workspace.'
    }
  }

  if (!args.modelId) {
    throw new Error('Model selection requires a model id.')
  }
  const modelId = args.modelId

  const nextConfig = await updateOpenGtmConfig(args.cwd, (config) => ({
    ...config,
    preferences: {
      ...(config.preferences ?? {
        outputMode: 'human',
        currentProvider: provider.id,
        currentModel,
        sandboxProfile: 'read-only'
      }),
      currentProvider: provider.id,
      currentModel: modelId
    }
  }))

  return {
    kind: 'models',
    action: 'use',
    provider: {
      id: provider.id,
      label: provider.label
    },
    currentModel: nextConfig.preferences?.currentModel || modelId,
    models: listModelsForProvider(provider.id, modelId).map((id) => ({
      id,
      current: id === (nextConfig.preferences?.currentModel || modelId)
    })),
    nextAction: `Model switched to ${modelId}.`
  }
}
