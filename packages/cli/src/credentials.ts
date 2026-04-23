import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface OpenGtmOAuthTokenRecord {
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  accountId: string | null
  updatedAt: string
}

export interface OpenGtmPendingPkceRecord {
  state: string
  verifier: string
  redirectUri: string
  authUrl: string
  createdAt: string
}

export interface OpenGtmAuthStoreProviderRecord {
  apiKey?: string
  oauth?: OpenGtmOAuthTokenRecord
  pendingPkce?: OpenGtmPendingPkceRecord
  updatedAt: string
}

export interface OpenGtmAuthStore {
  providers: Record<string, OpenGtmAuthStoreProviderRecord>
}

export const DEFAULT_AUTH_STORE_PATH = '.opengtm/auth.json'

export function maskSecret(value: string) {
  if (value.length <= 8) {
    return '*'.repeat(Math.max(value.length, 4))
  }

  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

export async function loadAuthStore(cwd: string): Promise<OpenGtmAuthStore> {
  try {
    const raw = await readFile(path.join(cwd, DEFAULT_AUTH_STORE_PATH), 'utf-8')
    const parsed = JSON.parse(raw) as OpenGtmAuthStore
    return {
      providers: parsed.providers || {}
    }
  } catch {
    return { providers: {} }
  }
}

export async function saveAuthStore(cwd: string, store: OpenGtmAuthStore): Promise<void> {
  await mkdir(path.join(cwd, '.opengtm'), { recursive: true })
  await writeFile(path.join(cwd, DEFAULT_AUTH_STORE_PATH), JSON.stringify(store, null, 2), 'utf-8')
}

function ensureProviderRecord(store: OpenGtmAuthStore, providerId: string) {
  const existing = store.providers[providerId]
  if (existing) {
    return existing
  }

  const created: OpenGtmAuthStoreProviderRecord = {
    updatedAt: new Date().toISOString()
  }
  store.providers[providerId] = created
  return created
}

export async function setProviderApiKey(cwd: string, providerId: string, apiKey: string) {
  const store = await loadAuthStore(cwd)
  const record = ensureProviderRecord(store, providerId)
  record.apiKey = apiKey
  record.updatedAt = new Date().toISOString()
  await saveAuthStore(cwd, store)
}

export async function clearProviderApiKey(cwd: string, providerId: string) {
  const store = await loadAuthStore(cwd)
  const record = store.providers[providerId]
  if (!record) return
  delete record.apiKey
  record.updatedAt = new Date().toISOString()
  if (!record.oauth && !record.pendingPkce) {
    delete store.providers[providerId]
  }
  await saveAuthStore(cwd, store)
}

export async function getProviderApiKey(cwd: string, providerId: string) {
  const store = await loadAuthStore(cwd)
  return store.providers[providerId]?.apiKey || null
}

export async function setProviderOauthTokens(cwd: string, providerId: string, oauth: Omit<OpenGtmOAuthTokenRecord, 'updatedAt'>) {
  const store = await loadAuthStore(cwd)
  const record = ensureProviderRecord(store, providerId)
  record.oauth = {
    ...oauth,
    updatedAt: new Date().toISOString()
  }
  record.updatedAt = new Date().toISOString()
  delete record.pendingPkce
  await saveAuthStore(cwd, store)
}

export async function getProviderOauthTokens(cwd: string, providerId: string) {
  const store = await loadAuthStore(cwd)
  return store.providers[providerId]?.oauth || null
}

export async function setProviderPendingPkce(cwd: string, providerId: string, pendingPkce: OpenGtmPendingPkceRecord) {
  const store = await loadAuthStore(cwd)
  const record = ensureProviderRecord(store, providerId)
  record.pendingPkce = pendingPkce
  record.updatedAt = new Date().toISOString()
  await saveAuthStore(cwd, store)
}

export async function getProviderPendingPkce(cwd: string, providerId: string) {
  const store = await loadAuthStore(cwd)
  return store.providers[providerId]?.pendingPkce || null
}

export async function clearProviderPendingPkce(cwd: string, providerId: string) {
  const store = await loadAuthStore(cwd)
  const record = store.providers[providerId]
  if (!record) return
  delete record.pendingPkce
  record.updatedAt = new Date().toISOString()
  await saveAuthStore(cwd, store)
}

export async function clearProviderAuth(cwd: string, providerId: string) {
  const store = await loadAuthStore(cwd)
  delete store.providers[providerId]
  await saveAuthStore(cwd, store)
}
