import { env } from "cloudflare:workers";

export function instagramDB(): D1Database {
  return rankmeDB();
}

export function rankmeDB(): D1Database {
  if (!env.DB) throw new Error("FameRiser storage is unavailable");
  return env.DB;
}
