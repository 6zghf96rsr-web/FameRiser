// Server-only budget shared across Worker instances through D1. Bind this to
// the public read handler only after verifying that Cloudflare supplies the
// connecting-IP header and the D1 binding is the production shared database.
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

const requestsPerMinute = 60;
const minuteMs = 60_000;
const retentionMinutes = 2 * 24 * 60;

export function createPublicReadRateLimit(
  db: D1Database | undefined,
  secret: string | undefined,
  now: () => number = Date.now,
): (request: Request) => Promise<boolean> {
  return async (request) => {
    if (!db || typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
      throw new Error("Public read limiter is not configured");
    }
    // No X-Forwarded-For fallback: its entries can originate with the client.
    const ip = request.headers.get("cf-connecting-ip");
    if (!ip || ip !== ip.trim() || isIP(ip) === 0) {
      throw new Error("Trusted visitor address is unavailable");
    }
    const current = now();
    if (!Number.isSafeInteger(current) || current < 0) {
      throw new Error("Public read limiter clock is unavailable");
    }
    const minute = Math.floor(current / minuteMs);
    const day = Math.floor(current / 86_400_000);
    const subjectHash = createHmac("sha256", secret)
      .update(`public-read-v1:${day}:${ip}`).digest("hex");

    // D1 executes the batch in one transaction. One UPSERT serializes
    // concurrent reads for the same address, even on different instances.
    const results = await db.batch([
      db.prepare("DELETE FROM public_read_limits WHERE last_seen < ?")
        .bind(minute - retentionMinutes),
      db.prepare(`
        INSERT INTO public_read_limits(subject_hash, window_start, requests, last_seen)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(subject_hash) DO UPDATE SET
          window_start = excluded.window_start,
          requests = CASE WHEN public_read_limits.window_start = excluded.window_start
            THEN public_read_limits.requests + 1 ELSE 1 END,
          last_seen = excluded.last_seen
        WHERE public_read_limits.window_start < excluded.window_start
          OR public_read_limits.requests < ?
        RETURNING requests
      `).bind(subjectHash, minute, minute, requestsPerMinute),
    ]);
    if (results.length !== 2 || !results[0].success || !results[1].success ||
        !Array.isArray(results[1].results)) {
      throw new Error("Public read limiter transaction failed");
    }
    if (results[1].results.length === 0) return false;
    const count = (results[1].results[0] as { requests?: unknown }).requests;
    if (typeof count !== "number" || !Number.isSafeInteger(count) ||
        count < 1 || count > requestsPerMinute) {
      throw new Error("Public read limiter returned invalid data");
    }
    return true;
  };
}
