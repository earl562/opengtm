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

export interface OpenGtmSecretBackend {
  kind: string
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

export function createEnvSecretBackend({ prefix = 'OPENGTM_' }: { prefix?: string } = {}): OpenGtmSecretBackend {
  return {
    kind: 'env',
    async get(key: string) {
      return process.env[`${prefix}${key}`] || null
    },
    async set(_key: string, _value: string) {
      // Intentionally no-op: environment is read-only at runtime.
      throw new Error('Env secret backend is read-only')
    }
  }
}
