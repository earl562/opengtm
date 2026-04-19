import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { OpenGtmAutonomyMode } from './autonomy.js'

export interface OpenGtmConfig {
  runtimeDir: string
  workspaceId: string
  initiativeId: string
  workspaceName: string
  initiativeTitle: string
  workspaceRoot: string
  autonomyMode?: OpenGtmAutonomyMode
}

export const DEFAULT_RUNTIME_DIR = '.opengtm/runtime'
export const DEFAULT_CONFIG_PATH = '.opengtm/config.json'

export async function loadOpenGtmConfig(cwd: string): Promise<OpenGtmConfig | null> {
  try {
    const content = await readFile(path.join(cwd, DEFAULT_CONFIG_PATH), 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export async function saveOpenGtmConfig(cwd: string, config: OpenGtmConfig): Promise<void> {
  await mkdir(path.join(cwd, '.opengtm'), { recursive: true })
  await writeFile(
    path.join(cwd, DEFAULT_CONFIG_PATH),
    JSON.stringify(config, null, 2),
    'utf-8'
  )
}
