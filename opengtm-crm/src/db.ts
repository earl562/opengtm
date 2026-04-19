import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

const require = createRequire(import.meta.url);
const SQLITE_MODULE = "node:sqlite";
// Keep as runtime require to avoid bundler/vitest rewriting `node:sqlite` -> `sqlite`.
const { DatabaseSync } = require(SQLITE_MODULE) as typeof import("node:sqlite");

export type Db = DatabaseSyncType;

export function openDb(filename: string): Db {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

export function closeDb(db: Db): void {
  db.close();
}

function migrate(db: Db): void {
  // Minimal schema; evolve with explicit migrations as needed.
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      account_id TEXT NULL,
      name TEXT NOT NULL,
      email TEXT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      account_id TEXT NULL,
      name TEXT NOT NULL,
      amount_cents INTEGER NULL,
      stage TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      type TEXT NOT NULL,
      related_type TEXT NULL,
      related_id TEXT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
