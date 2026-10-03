// FR-AI-04B transport boundary for a future server-only read route. The
// caller must supply a trusted reader role and a shared durable rate limiter.
import { createHmac, timingSafeEqual } from "node:crypto";
import { readGlobalPageExact, readPublicCreatorExact, type InternalCursor, type PilotReader } from "./pilot-read-v1";
import { RULES_VERSION } from "./v1";

const lifetimeMs = 10 * 60 * 1000;
const publicUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface PublicReadDependencies {
  reader: PilotReader;
  cursorKey: string;
  rateLimit: (request: Request) => Promise<boolean>;
  now?: () => number;
}

class ApiFault extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}

function requireKey(deps: PublicReadDependencies): void {
  if (typeof deps.cursorKey !== "string" || Buffer.byteLength(deps.cursorKey) < 32) {
    throw new ApiFault(503, "UNAVAILABLE");
  }
}

function signature(key: string, payload: string): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

function encodeCursor(cursor: InternalCursor, limit: number, key: string, now: number): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, s: "global", p: "all_time",
    l: limit, a: cursor.asOf, r: cursor.projectionRevision,
    rv: cursor.rulesVersion, n: cursor.nextIndex, t: now })).toString("base64url");
  return `${payload}.${signature(key, payload).toString("base64url")}`;
}

function decodeCursor(token: string, limit: number, key: string, now: number): InternalCursor {
  if (token.length > 512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new ApiFault(422, "INVALID_CURSOR");
  }
  const [payload, mac] = token.split(".");
  const supplied = Buffer.from(mac, "base64url");
  const expected = signature(key, payload);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ApiFault(422, "INVALID_CURSOR");
  }
  let raw: unknown;
  try { raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch { throw new ApiFault(422, "INVALID_CURSOR"); }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ApiFault(422, "INVALID_CURSOR");
  }
  const value = raw as Record<string, unknown>;
  if (value.v !== 1 || value.s !== "global" || value.p !== "all_time" ||
      value.l !== limit || value.rv !== RULES_VERSION ||
      typeof value.a !== "string" || !Number.isFinite(Date.parse(value.a)) ||
      typeof value.r !== "number" || !Number.isSafeInteger(value.r) || value.r < 1 ||
      typeof value.n !== "number" || !Number.isSafeInteger(value.n) || value.n < 0 ||
      typeof value.t !== "number" || !Number.isSafeInteger(value.t) || value.t > now) {
    throw new ApiFault(422, "INVALID_CURSOR");
  }
  if (now - Number(value.t) > lifetimeMs) throw new ApiFault(410, "CURSOR_EXPIRED");
  return { period: "all_time", periodStart: null, asOf: value.a,
    projectionRevision: Number(value.r), rulesVersion: RULES_VERSION,
    nextIndex: Number(value.n) };
}

async function guarded(deps: PublicReadDependencies, request: Request,
  work: () => Promise<Response>): Promise<Response> {
  try {
    requireKey(deps);
    if (!(await deps.rateLimit(request))) throw new ApiFault(429, "RATE_LIMITED");
    return await work();
  } catch (error) {
    if (error instanceof ApiFault) return response({ error: error.code }, error.status);
    return response({ error: "UNAVAILABLE" }, 503);
  }
}

export async function handleLeaderboardRead(request: Request,
  deps: PublicReadDependencies): Promise<Response> {
  return guarded(deps, request, async () => {
    if (request.method !== "GET") throw new ApiFault(405, "METHOD_NOT_ALLOWED");
    const url = new URL(request.url);
    if (url.pathname !== "/api/v1/leaderboards") throw new ApiFault(404, "NOT_FOUND");
    const params = url.searchParams;
    for (const key of params.keys()) {
      if (!["scope", "period", "limit", "cursor"].includes(key) || params.getAll(key).length !== 1) {
        throw new ApiFault(422, "INVALID_REQUEST");
      }
    }
    if (params.get("scope") !== "global" || params.get("period") !== "all_time") {
      throw new ApiFault(422, "UNSUPPORTED_SCOPE_OR_PERIOD");
    }
    const limitRaw = params.get("limit") ?? "25";
    if (!/^[1-9][0-9]{0,2}$/.test(limitRaw)) throw new ApiFault(422, "INVALID_REQUEST");
    const limit = Number(limitRaw);
    if (limit > 100) throw new ApiFault(422, "INVALID_REQUEST");
    const now = deps.now?.() ?? Date.now();
    const token = params.get("cursor");
    const cursor = token === null ? undefined : decodeCursor(token, limit, deps.cursorKey, now);
    const result = await readGlobalPageExact(deps.reader,
      { period: "all_time", pageSize: limit, cursor });
    if (result.status === "STALE_CURSOR") throw new ApiFault(410, "CURSOR_EXPIRED");
    return response({ ...result.page, stale: false,
      next_cursor: result.nextCursor ? encodeCursor(result.nextCursor, limit, deps.cursorKey, now) : null });
  });
}

export async function handleCreatorRead(request: Request, publicId: string,
  deps: PublicReadDependencies): Promise<Response> {
  return guarded(deps, request, async () => {
    if (request.method !== "GET") throw new ApiFault(405, "METHOD_NOT_ALLOWED");
    const url = new URL(request.url);
    if (url.searchParams.size || !publicUuid.test(publicId)) {
      throw new ApiFault(422, "INVALID_REQUEST");
    }
    if (url.pathname !== `/api/v1/creators/${publicId}`) throw new ApiFault(404, "NOT_FOUND");
    const result = await readPublicCreatorExact(deps.reader, publicId);
    return result.status === "NOT_PUBLIC"
      ? response({ error: "NOT_PUBLIC" }, 404)
      : response({ ...result.row, stale: false });
  });
}
