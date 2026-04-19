import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')

export interface CanonicalCrmLead {
  id: string
  name: string
  email: string | null
  status: 'new' | 'qualified' | 'disqualified'
  createdAt: string
}

export interface CanonicalCrmActivity {
  id: string
  subject: string
  type: 'note' | 'call' | 'email'
  relatedType: 'lead' | 'account' | 'opportunity' | null
  relatedId: string | null
  createdAt: string
}

function nowIso() {
  return new Date().toISOString()
}

function openCanonicalCrmDb(dbFile: string) {
  mkdirSync(dirname(dbFile), { recursive: true })
  const db = new DatabaseSync(dbFile)
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      type TEXT NOT NULL,
      related_type TEXT NULL,
      related_id TEXT NULL,
      created_at TEXT NOT NULL
    );
  `)
  return db
}

export function resolveCanonicalCrmDbFile(rootDir: string) {
  return join(rootDir, 'fixtures', 'opengtm-crm.sqlite')
}

export function createCanonicalLead(dbFile: string, input: {
  name: string
  email?: string | null
}): CanonicalCrmLead {
  const db = openCanonicalCrmDb(dbFile)
  try {
    const lead: CanonicalCrmLead = {
      id: randomUUID(),
      name: input.name,
      email: input.email ?? null,
      status: 'new',
      createdAt: nowIso()
    }
    db.prepare(
      'INSERT INTO leads (id, name, email, status, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(lead.id, lead.name, lead.email, lead.status, lead.createdAt)
    return lead
  } finally {
    db.close()
  }
}

export function createCanonicalActivity(dbFile: string, input: {
  subject: string
  type: CanonicalCrmActivity['type']
  relatedType?: CanonicalCrmActivity['relatedType']
  relatedId?: string | null
}): CanonicalCrmActivity {
  const db = openCanonicalCrmDb(dbFile)
  try {
    const activity: CanonicalCrmActivity = {
      id: randomUUID(),
      subject: input.subject,
      type: input.type,
      relatedType: input.relatedType ?? 'lead',
      relatedId: input.relatedId ?? null,
      createdAt: nowIso()
    }
    db.prepare(
      'INSERT INTO activities (id, subject, type, related_type, related_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      activity.id,
      activity.subject,
      activity.type,
      activity.relatedType,
      activity.relatedId,
      activity.createdAt
    )
    return activity
  } finally {
    db.close()
  }
}

export function listCanonicalActivities(dbFile: string): CanonicalCrmActivity[] {
  const db = openCanonicalCrmDb(dbFile)
  try {
    return db.prepare(
      'SELECT id, subject, type, related_type as relatedType, related_id as relatedId, created_at as createdAt FROM activities ORDER BY created_at ASC'
    ).all() as unknown as CanonicalCrmActivity[]
  } finally {
    db.close()
  }
}

export function parseCanonicalConnectorTargets(targets: string[]) {
  const dbFile = targets.find((item) => item.startsWith('crm-db:'))?.slice('crm-db:'.length) || null
  const leadId = targets.find((item) => item.startsWith('crm-lead:'))?.slice('crm-lead:'.length) || null
  const checkpointId = targets.find((item) => item.startsWith('checkpoint:'))?.slice('checkpoint:'.length) || null
  const checkpointCreatedAt = targets.find((item) => item.startsWith('checkpoint-at:'))?.slice('checkpoint-at:'.length) || null
  return {
    dbFile,
    leadId,
    checkpointId,
    checkpointCreatedAt
  }
}
