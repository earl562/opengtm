import http from "node:http";
import { pathToFileURL } from "node:url";
import { closeDb, openDb, type Db } from "./db.js";
import { badRequest, json, notFound, readJson } from "./http.js";
import { createAccount, createActivity, createLead, listAccounts, listActivities, listLeads } from "./repo.js";

export interface OpenGtmCrmServerOptions {
  db?: Db;
  dbFile?: string;
}

export interface StartedOpenGtmCrmServer {
  server: http.Server;
  db: Db;
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
}

export function createCrmRequestHandler(db: Db): http.RequestListener {
  return async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const path = url.pathname;

      if (method === "GET" && path === "/health") return json(res, 200, { ok: true });

      if (path === "/accounts") {
        if (method === "GET") return json(res, 200, { data: listAccounts(db) });
        if (method === "POST") {
          const body = (await readJson(req)) as { name?: unknown } | null;
          if (!body || typeof body !== "object") return badRequest(res, "expected JSON body");
          if (typeof body.name !== "string" || body.name.trim() === "") return badRequest(res, "name is required");
          const created = createAccount(db, { name: body.name.trim() });
          return json(res, 201, { data: created });
        }
      }

      if (path === "/leads") {
        if (method === "GET") return json(res, 200, { data: listLeads(db) });
        if (method === "POST") {
          const body = (await readJson(req)) as { name?: unknown; email?: unknown } | null;
          if (!body || typeof body !== "object") return badRequest(res, "expected JSON body");
          if (typeof body.name !== "string" || body.name.trim() === "") return badRequest(res, "name is required");
          const email = typeof body.email === "string" ? body.email : body.email == null ? null : undefined;
          if (email === undefined) return badRequest(res, "email must be a string or null");
          const created = createLead(db, { name: body.name.trim(), email });
          return json(res, 201, { data: created });
        }
      }

      if (path === "/activities") {
        if (method === "GET") return json(res, 200, { data: listActivities(db) });
        if (method === "POST") {
          const body = (await readJson(req)) as {
            subject?: unknown;
            type?: unknown;
            relatedType?: unknown;
            relatedId?: unknown;
          } | null;
          if (!body || typeof body !== "object") return badRequest(res, "expected JSON body");
          if (typeof body.subject !== "string" || body.subject.trim() === "") return badRequest(res, "subject is required");
          if (body.type !== "note" && body.type !== "call" && body.type !== "email") return badRequest(res, "invalid type");

          const relatedType =
            body.relatedType == null
              ? null
              : body.relatedType === "account" || body.relatedType === "lead" || body.relatedType === "opportunity"
                ? body.relatedType
                : undefined;
          if (relatedType === undefined) return badRequest(res, "invalid relatedType");

          const relatedId = body.relatedId == null ? null : typeof body.relatedId === "string" ? body.relatedId : undefined;
          if (relatedId === undefined) return badRequest(res, "relatedId must be a string or null");

          const created = createActivity(db, {
            subject: body.subject.trim(),
            type: body.type,
            relatedType,
            relatedId
          });
          return json(res, 201, { data: created });
        }
      }

      return notFound(res);
    } catch {
      json(res, 500, { error: "internal_error" });
    }
  };
}

export function createCrmServer(options: OpenGtmCrmServerOptions = {}): StartedOpenGtmCrmServer {
  const ownsDb = !options.db;
  const db = options.db ?? openDb(options.dbFile ?? "./opengtm-crm.sqlite");
  const server = http.createServer(createCrmRequestHandler(db));

  return {
    server,
    db,
    port: 0,
    baseUrl: "",
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      if (ownsDb) {
        closeDb(db);
      }
    }
  };
}

export async function startCrmServer({
  port = 3000,
  host = "127.0.0.1",
  ...options
}: OpenGtmCrmServerOptions & { port?: number; host?: string } = {}): Promise<StartedOpenGtmCrmServer> {
  const instance = createCrmServer(options);

  await new Promise<void>((resolve, reject) => {
    instance.server.once("error", reject);
    instance.server.listen(port, host, () => {
      instance.server.off("error", reject);
      resolve();
    });
  });

  const address = instance.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine OpenGTM CRM server address");
  }

  return {
    ...instance,
    port: address.port,
    baseUrl: `http://${host}:${address.port}`
  };
}

async function runCliServer(): Promise<void> {
  const port = Number(process.env.PORT ?? "3000");
  const dbFile = process.env.DATABASE_URL ?? "./opengtm-crm.sqlite";
  const started = await startCrmServer({ port, dbFile, host: "127.0.0.1" });
  console.log(`opengtm-crm listening on ${started.baseUrl} (db: ${dbFile})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCliServer();
}
