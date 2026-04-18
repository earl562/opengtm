import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { OpenGtmStorage, OpenGtmArtifactPathInput, OpenGtmArtifactBlobInput, OpenGtmReadArtifactOptions } from './types.js'

export function resolveArtifactPath(store: OpenGtmStorage, {
  workspaceSlug = 'global',
  artifactId,
  extension = 'json'
}: OpenGtmArtifactPathInput): string {
  const workspaceDir = join(store.artifactsDir, workspaceSlug)
  mkdirSync(workspaceDir, { recursive: true })
  return join(workspaceDir, `${artifactId}.${extension}`)
}

export function writeArtifactBlob(store: OpenGtmStorage, {
  workspaceSlug = 'global',
  artifactId,
  content,
  extension = 'json'
}: OpenGtmArtifactBlobInput): string {
  const filePath = resolveArtifactPath(store, { workspaceSlug, artifactId, extension })
  const payload = typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2)
  writeFileSync(filePath, payload, 'utf8')
  return filePath
}

export function readArtifactBlob(filePath: string, { parseJson = false }: OpenGtmReadArtifactOptions = {}): string | Record<string, unknown> {
  const content = readFileSync(filePath, 'utf8')
  return parseJson ? JSON.parse(content) : content
}

export function appendArtifactEvent(store: OpenGtmStorage, {
  workspaceSlug = 'global',
  artifactId,
  event,
  extension = 'log'
}: { workspaceSlug?: string; artifactId: string; event: Record<string, unknown>; extension?: string }): string {
  const filePath = resolveArtifactPath(store, { workspaceSlug, artifactId, extension })
  const line = JSON.stringify({
    createdAt: new Date().toISOString(),
    ...event
  })
  writeFileSync(filePath, `${line}\n`, { encoding: 'utf8', flag: 'a' })
  return filePath
}