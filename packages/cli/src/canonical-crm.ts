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

export interface CanonicalCrmAccount {
  id: string
  name: string
  domain: string | null
  stage: 'customer' | 'prospect'
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

export interface CanonicalCrmOpportunity {
  id: string
  accountId: string
  name: string
  amountCents: number | null
  stage: 'open' | 'won' | 'lost'
  createdAt: string
}

function nowIso() {
  return new Date().toISOString()
}

function openCanonicalCrmDb(dbFile: string) {
  mkdirSync(dirname(dbFile), { recursive: true })
  const db = new DatabaseSync(dbFile)
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NULL,
      stage TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
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
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      name TEXT NOT NULL,
      amount_cents INTEGER NULL,
      stage TEXT NOT NULL,
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

export function createCanonicalAccount(dbFile: string, input: {
  name: string
  domain?: string | null
  stage?: CanonicalCrmAccount['stage']
}): CanonicalCrmAccount {
  const db = openCanonicalCrmDb(dbFile)
  try {
    const account: CanonicalCrmAccount = {
      id: randomUUID(),
      name: input.name,
      domain: input.domain ?? null,
      stage: input.stage ?? 'customer',
      createdAt: nowIso()
    }
    db.prepare(
      'INSERT INTO accounts (id, name, domain, stage, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(account.id, account.name, account.domain, account.stage, account.createdAt)
    return account
  } finally {
    db.close()
  }
}

export function listCanonicalAccounts(dbFile: string): CanonicalCrmAccount[] {
  const db = openCanonicalCrmDb(dbFile)
  try {
    return db.prepare(
      'SELECT id, name, domain, stage, created_at as createdAt FROM accounts ORDER BY created_at ASC'
    ).all() as unknown as CanonicalCrmAccount[]
  } finally {
    db.close()
  }
}

export function createCanonicalOpportunity(dbFile: string, input: {
  accountId: string
  name: string
  amountCents?: number | null
  stage?: CanonicalCrmOpportunity['stage']
}): CanonicalCrmOpportunity {
  const db = openCanonicalCrmDb(dbFile)
  try {
    const opportunity: CanonicalCrmOpportunity = {
      id: randomUUID(),
      accountId: input.accountId,
      name: input.name,
      amountCents: input.amountCents ?? null,
      stage: input.stage ?? 'open',
      createdAt: nowIso()
    }
    db.prepare(
      'INSERT INTO opportunities (id, account_id, name, amount_cents, stage, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      opportunity.id,
      opportunity.accountId,
      opportunity.name,
      opportunity.amountCents,
      opportunity.stage,
      opportunity.createdAt
    )
    return opportunity
  } finally {
    db.close()
  }
}

export function listCanonicalOpportunities(dbFile: string): CanonicalCrmOpportunity[] {
  const db = openCanonicalCrmDb(dbFile)
  try {
    return db.prepare(
      'SELECT id, account_id as accountId, name, amount_cents as amountCents, stage, created_at as createdAt FROM opportunities ORDER BY created_at ASC'
    ).all() as unknown as CanonicalCrmOpportunity[]
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

export function getCanonicalLead(dbFile: string, id: string): CanonicalCrmLead | null {
  const db = openCanonicalCrmDb(dbFile)
  try {
    const row = db.prepare(
      'SELECT id, name, email, status, created_at as createdAt FROM leads WHERE id = ?'
    ).get(id) as CanonicalCrmLead | undefined
    return row || null
  } finally {
    db.close()
  }
}

export function getCanonicalAccount(dbFile: string, id: string): CanonicalCrmAccount | null {
  const db = openCanonicalCrmDb(dbFile)
  try {
    const row = db.prepare(
      'SELECT id, name, domain, stage, created_at as createdAt FROM accounts WHERE id = ?'
    ).get(id) as CanonicalCrmAccount | undefined
    return row || null
  } finally {
    db.close()
  }
}

export function getCanonicalOpportunity(dbFile: string, id: string): CanonicalCrmOpportunity | null {
  const db = openCanonicalCrmDb(dbFile)
  try {
    const row = db.prepare(
      'SELECT id, account_id as accountId, name, amount_cents as amountCents, stage, created_at as createdAt FROM opportunities WHERE id = ?'
    ).get(id) as CanonicalCrmOpportunity | undefined
    return row || null
  } finally {
    db.close()
  }
}

export function listCanonicalActivitiesForEntity(dbFile: string, args: {
  relatedType: CanonicalCrmActivity['relatedType']
  relatedId: string
}): CanonicalCrmActivity[] {
  const db = openCanonicalCrmDb(dbFile)
  try {
    return db.prepare(
      'SELECT id, subject, type, related_type as relatedType, related_id as relatedId, created_at as createdAt FROM activities WHERE related_type = ? AND related_id = ? ORDER BY created_at ASC'
    ).all(args.relatedType, args.relatedId) as unknown as CanonicalCrmActivity[]
  } finally {
    db.close()
  }
}

export function collectCanonicalRuntimeEvidence(args: {
  dbFile: string
  leadId?: string | null
  accountId?: string | null
  opportunityId?: string | null
}) {
  const lead = args.leadId ? getCanonicalLead(args.dbFile, args.leadId) : null
  const account = args.accountId ? getCanonicalAccount(args.dbFile, args.accountId) : null
  const opportunity = args.opportunityId ? getCanonicalOpportunity(args.dbFile, args.opportunityId) : null
  const leadActivities = args.leadId ? listCanonicalActivitiesForEntity(args.dbFile, { relatedType: 'lead', relatedId: args.leadId }) : []
  const accountActivities = args.accountId ? listCanonicalActivitiesForEntity(args.dbFile, { relatedType: 'account', relatedId: args.accountId }) : []
  const opportunityActivities = args.opportunityId ? listCanonicalActivitiesForEntity(args.dbFile, { relatedType: 'opportunity', relatedId: args.opportunityId }) : []

  return {
    lead,
    account,
    opportunity,
    activities: {
      lead: leadActivities,
      account: accountActivities,
      opportunity: opportunityActivities
    }
  }
}

export function parseCanonicalConnectorTargets(targets: string[]) {
  const dbFile = targets.find((item) => item.startsWith('crm-db:'))?.slice('crm-db:'.length) || null
  const leadId = targets.find((item) => item.startsWith('crm-lead:'))?.slice('crm-lead:'.length) || null
  const accountId = targets.find((item) => item.startsWith('crm-account:'))?.slice('crm-account:'.length) || null
  const opportunityId = targets.find((item) => item.startsWith('crm-opportunity:'))?.slice('crm-opportunity:'.length) || null
  const checkpointId = targets.find((item) => item.startsWith('checkpoint:'))?.slice('checkpoint:'.length) || null
  const checkpointCreatedAt = targets.find((item) => item.startsWith('checkpoint-at:'))?.slice('checkpoint-at:'.length) || null
  return {
    dbFile,
    leadId,
    accountId,
    opportunityId,
    checkpointId,
    checkpointCreatedAt
  }
}
