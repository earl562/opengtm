import type { OpenGtmSecretDescriptorInput } from './types.js'

export function detectSecretBackend(): string {
  if (process.platform === 'darwin') return 'macos-keychain'
  if (process.platform === 'win32') return 'windows-credential-manager'
  if (process.platform === 'linux') return 'libsecret-or-env'
  return 'env-only'
}

export function createSecretDescriptor({ provider, scope = 'workspace', secretKeys = [] }: OpenGtmSecretDescriptorInput) {
  return {
    provider,
    scope,
    backend: detectSecretBackend(),
    secretKeys
  }
}