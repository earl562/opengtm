import path from 'node:path'
import type { OpenGtmStoragePaths } from './types.js'

export function createStoragePaths(rootDir: string): OpenGtmStoragePaths {
  return {
    rootDir,
    artifactsDir: path.join(rootDir, 'artifacts'),
    databasePath: path.join(rootDir, 'opengtm.sqlite')
  }
}