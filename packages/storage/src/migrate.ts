import type { DatabaseSync } from 'node:sqlite'
import { OPEN_GTM_STORAGE_TABLES } from './constants.js'

export function migrateStorage(db: DatabaseSync): void {
  for (const table of OPEN_GTM_STORAGE_TABLES) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
  }
}