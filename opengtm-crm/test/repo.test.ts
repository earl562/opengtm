import { describe, expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { createAccount, createActivity, createLead, listAccounts, listActivities, listLeads } from "../src/repo.js";

describe("repo", () => {
  test("can create and list accounts", () => {
    const db = openDb(":memory:");
    createAccount(db, { name: "Acme" });
    createAccount(db, { name: "Globex" });
    const accounts = listAccounts(db);
    expect(accounts.map((a) => a.name)).toEqual(["Acme", "Globex"]);
  });

  test("can create and list leads", () => {
    const db = openDb(":memory:");
    createLead(db, { name: "Pat", email: "pat@example.com" });
    createLead(db, { name: "Sam" });
    const leads = listLeads(db);
    expect(leads).toHaveLength(2);
    expect(leads[0]?.status).toBe("new");
  });

  test("can create and list activities", () => {
    const db = openDb(":memory:");
    createActivity(db, { subject: "Intro call", type: "call" });
    const activities = listActivities(db);
    expect(activities).toHaveLength(1);
    expect(activities[0]?.subject).toBe("Intro call");
  });
});
