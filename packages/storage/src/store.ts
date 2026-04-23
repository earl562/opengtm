import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { createStoragePaths } from './paths.js'
import { migrateStorage } from './migrate.js'
import { OPEN_GTM_STORAGE_SCHEMA_VERSION, OPEN_GTM_STORAGE_TABLES, type OpenGtmStorageTable } from './constants.js'
import type { OpenGtmStorage, OpenGtmStorageRecord, OpenGtmRecordQuery } from './types.js'

const require = createRequire(import.meta.url)
const SQLITE_MODULE = 'node:sqlite'
// Keep as runtime require to avoid bundler rewriting `node:sqlite` → `sqlite`.
const { DatabaseSync } = require(SQLITE_MODULE) as typeof import('node:sqlite')

export function createStorage({ rootDir }: { rootDir: string }): OpenGtmStorage {
  const paths = createStoragePaths(rootDir)
  mkdirSync(paths.rootDir, { recursive: true })
  mkdirSync(paths.artifactsDir, { recursive: true })

  const db = new DatabaseSync(paths.databasePath)
  migrateStorage(db)

  return {
    ...paths,
    schemaVersion: OPEN_GTM_STORAGE_SCHEMA_VERSION,
    db
  }
}

function assertKnownTable(table: string): asserts table is OpenGtmStorageTable {
  if (!(OPEN_GTM_STORAGE_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Unknown OpenGTM storage table: ${table}`)
  }
}

export function upsertRecord(store: OpenGtmStorage, table: OpenGtmStorageTable, record: OpenGtmStorageRecord) {
  assertKnownTable(table)
  const stmt = store.db.prepare(`
    INSERT INTO ${table} (id, workspace_id, payload, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      workspace_id = excluded.workspace_id,
      payload = excluded.payload,
      created_at = excluded.created_at
  `)

  stmt.run(
    record.id,
    record.workspaceId || null,
    JSON.stringify(record),
    record.createdAt || new Date().toISOString()
  )

  return record
}

export function getRecord<T = OpenGtmStorageRecord>(store: OpenGtmStorage, table: OpenGtmStorageTable, id: string): T | null {
  assertKnownTable(table)
  const stmt = store.db.prepare(`SELECT payload FROM ${table} WHERE id = ?`)
  const row = stmt.get(id) as { payload: string | null } | undefined
  return row?.payload ? JSON.parse(row.payload) : null
}

export function listRecords<T = OpenGtmStorageRecord>(store: OpenGtmStorage, table: OpenGtmStorageTable, { workspaceId }: OpenGtmRecordQuery = {}): T[] {
  assertKnownTable(table)
  const stmt = workspaceId
    ? store.db.prepare(`SELECT payload FROM ${table} WHERE workspace_id = ? ORDER BY created_at ASC`)
    : store.db.prepare(`SELECT payload FROM ${table} ORDER BY created_at ASC`)

  const rows = (workspaceId ? stmt.all(workspaceId) : stmt.all()) as Array<{ payload: string | null }>
  return rows
    .filter((row) => Boolean(row.payload))
    .map((row) => JSON.parse(row.payload as string) as T)
}

export function deleteRecord(store: OpenGtmStorage, table: OpenGtmStorageTable, id: string): void {
  assertKnownTable(table)
  const stmt = store.db.prepare(`DELETE FROM ${table} WHERE id = ?`)
  stmt.run(id)
}

export function deleteRecordsAfter(store: OpenGtmStorage, table: OpenGtmStorageTable, afterIso: string): number {
  assertKnownTable(table)
  const stmt = store.db.prepare(`DELETE FROM ${table} WHERE created_at > ?`)
  const result = stmt.run(afterIso) as unknown as { changes: number }
  return (result as any).changes || 0
}

export function validateStorage(store: OpenGtmStorage) {
  const rows = store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
  const present = new Set(rows.map((row) => row.name))
  const missingTables = [...OPEN_GTM_STORAGE_TABLES].filter((table) => !present.has(table))

  return {
    schemaVersion: store.schemaVersion,
    valid: missingTables.length === 0,
    missingTables
  }
}
