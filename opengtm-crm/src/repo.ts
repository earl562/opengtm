import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import type { Account, Activity, Lead } from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export function createAccount(db: Db, input: { name: string }): Account {
  const id = randomUUID();
  const createdAt = nowIso();
  db.prepare("INSERT INTO accounts (id, name, created_at) VALUES (?, ?, ?)").run(id, input.name, createdAt);
  return { id, name: input.name, createdAt };
}

export function listAccounts(db: Db): Account[] {
  const rows = db.prepare("SELECT id, name, created_at as createdAt FROM accounts ORDER BY created_at ASC").all() as Array<{
    id: string;
    name: string;
    createdAt: string;
  }>;
  return rows;
}

export function createLead(db: Db, input: { name: string; email?: string | null }): Lead {
  const id = randomUUID();
  const createdAt = nowIso();
  const email = input.email ?? null;
  const status: Lead["status"] = "new";
  db.prepare("INSERT INTO leads (id, name, email, status, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    input.name,
    email,
    status,
    createdAt
  );
  return { id, name: input.name, email, status, createdAt };
}

export function listLeads(db: Db): Lead[] {
  const rows = db
    .prepare("SELECT id, name, email, status, created_at as createdAt FROM leads ORDER BY created_at ASC")
    .all() as Array<{ id: string; name: string; email: string | null; status: Lead["status"]; createdAt: string }>;
  return rows;
}

export function createActivity(
  db: Db,
  input: {
    subject: string;
    type: Activity["type"];
    relatedType?: Activity["relatedType"];
    relatedId?: string | null;
  }
): Activity {
  const id = randomUUID();
  const createdAt = nowIso();
  const relatedType = input.relatedType ?? null;
  const relatedId = input.relatedId ?? null;
  db.prepare(
    "INSERT INTO activities (id, subject, type, related_type, related_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.subject, input.type, relatedType, relatedId, createdAt);
  return { id, subject: input.subject, type: input.type, relatedType, relatedId, createdAt };
}

export function listActivities(db: Db): Activity[] {
  const rows = db
    .prepare(
      "SELECT id, subject, type, related_type as relatedType, related_id as relatedId, created_at as createdAt FROM activities ORDER BY created_at ASC"
    )
    .all() as Array<{
    id: string;
    subject: string;
    type: Activity["type"];
    relatedType: Activity["relatedType"];
    relatedId: string | null;
    createdAt: string;
  }>;
  return rows;
}
