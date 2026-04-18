import type { DatabaseSync } from 'node:sqlite'

export interface OpenGtmStoragePaths {
  rootDir: string
  artifactsDir: string
  databasePath: string
}

export interface OpenGtmStorage {
  rootDir: string
  artifactsDir: string
  databasePath: string
  schemaVersion: string
  db: DatabaseSync
}

export interface OpenGtmStorageRecord {
  id: string
  workspaceId?: string | null
  createdAt?: string
}

export interface OpenGtmRecordQuery {
  workspaceId?: string
}

export interface OpenGtmMemoryQuery {
  workspaceId?: string
  memoryType?: string
  scope?: string
  sourceId?: string
}

export interface OpenGtmArtifactPathInput {
  workspaceSlug?: string
  artifactId: string
  extension?: string
}

export interface OpenGtmArtifactBlobInput extends OpenGtmArtifactPathInput {
  content: string | Record<string, unknown>
}

export interface OpenGtmReadArtifactOptions {
  parseJson?: boolean
}

export interface OpenGtmSecretDescriptorInput {
  provider: string
  scope?: string
  secretKeys?: string[]
}

export interface OpenGtmArtifactEventInput extends OpenGtmArtifactPathInput {
  event: Record<string, unknown>
}