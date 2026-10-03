// FR-AI-04B transport boundary for a future server-only read route. The
// caller must supply a trusted reader role and a shared durable rate limiter.
import { createHmac, timingSafeEqual } from "node:crypto";
import { readGlobalPageExact, readPublicCreatorExact, type InternalCursor, type PilotReader } from "./pilot-read-v1";
import { RULES_VERSION } from "./v1";

const lifetimeMs = 10 * 60 * 1000;
const publicUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface PublicReadDependencies {
  reader: PilotReader;
  cursorKeys: {
    active: CursorSigningKey;
    previous?: RetiredCursorSigningKey;
  };
  rateLimit: (request: Request) => Promise<boolean>;
  now?: () => number;
}

export interface CursorSigningKey {
  id: string;
  secret: string;
}

export interface RetiredCursorSigningKey extends CursorSigningKey {
  retiredAt: number;
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

function validKey(key: unknown): key is CursorSigningKey {
  if (typeof key !== "object" || key === null || Array.isArray(key)) return false;
  const value = key as Record<string, unknown>;
  return typeof value.id === "string" && /^[A-Za-z0-9_-]{1,16}$/.test(value.id) &&
    typeof value.secret === "string" && Buffer.byteLength(value.secret) >= 32;
}

function validPrevious(key: unknown, now: number): key is RetiredCursorSigningKey {
  if (!validKey(key)) return false;
  const retiredAt = (key as unknown as Record<string, unknown>).retiredAt;
  return typeof retiredAt === "number" && Number.isSafeInteger(retiredAt) &&
    retiredAt > 0 && retiredAt <= now;
}

function requireKeys(deps: PublicReadDependencies, now: number): void {
  const keys = deps.cursorKeys;
  if (!keys || !validKey(keys.active) ||
      (keys.previous !== undefined &&
        (!validPrevious(keys.previous, now) || keys.previous.id === keys.active.id ||
          keys.previous.secret === keys.active.secret))) {
    throw new ApiFault(503, "UNAVAILABLE");
  }
}

function signature(key: CursorSigningKey, payload: string): Buffer {
  return createHmac("sha256", key.secret).update(`${key.id}.${payload}`).digest();
}

function encodeCursor(cursor: InternalCursor, limit: number, key: CursorSigningKey, now: number): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, s: "global", p: "all_time",
    l: limit, a: cursor.asOf, r: cursor.projectionRevision,
    rv: cursor.rulesVersion, n: cursor.nextIndex, t: now })).toString("base64url");
  return `${key.id}.${payload}.${signature(key, payload).toString("base64url")}`;
}

function decodeCursor(token: string, limit: number,
  keys: PublicReadDependencies["cursorKeys"], now: number): InternalCursor {
  if (token.length > 512 || !/^[A-Za-z0-9_-]{1,16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new ApiFault(422, "INVALID_CURSOR");
  }
  const [id, payload, mac] = token.split(".");
  const key = keys.active.id === id ? keys.active :
    keys.previous?.id === id ? keys.previous : null;
  if (!key) throw new ApiFault(422, "INVALID_CURSOR");
  const supplied = Buffer.from(mac, "base64url");
  const expected = signature(key, payload);
  if (supplied.toString("base64url") !== mac || supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)) {
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
  if (keys.previous?.id === id && Number(value.t) > keys.previous.retiredAt) {
    throw new ApiFault(422, "INVALID_CURSOR");
  }
  return { period: "all_time", periodStart: null, asOf: value.a,
    projectionRevision: Number(value.r), rulesVersion: RULES_VERSION,
    nextIndex: Number(value.n) };
}

async function guarded(deps: PublicReadDependencies, request: Request,
  work: (now: number) => Promise<Response>): Promise<Response> {
  try {
    const now = deps.now?.() ?? Date.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new ApiFault(503, "UNAVAILABLE");
    requireKeys(deps, now);
    if (!(await deps.rateLimit(request))) throw new ApiFault(429, "RATE_LIMITED");
    return await work(now);
  } catch (error) {
    if (error instanceof ApiFault) return response({ error: error.code }, error.status);
    return response({ error: "UNAVAILABLE" }, 503);
  }
}

export async function handleLeaderboardRead(request: Request,
  deps: PublicReadDependencies): Promise<Response> {
  return guarded(deps, request, async (now) => {
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
    const token = params.get("cursor");
    const cursor = token === null ? undefined : decodeCursor(token, limit, deps.cursorKeys, now);
    const result = await readGlobalPageExact(deps.reader,
      { period: "all_time", pageSize: limit, cursor });
    if (result.status === "STALE_CURSOR") throw new ApiFault(410, "CURSOR_EXPIRED");
    return response({ ...result.page, stale: false,
      next_cursor: result.nextCursor ? encodeCursor(result.nextCursor, limit, deps.cursorKeys.active, now) : null });
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
