import { IncomingMessage } from "node:http";

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return null;
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

export function json(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(payload);
}

export function notFound(res: import("node:http").ServerResponse): void {
  json(res, 404, { error: "not_found" });
}

export function badRequest(res: import("node:http").ServerResponse, message: string): void {
  json(res, 400, { error: "bad_request", message });
}
