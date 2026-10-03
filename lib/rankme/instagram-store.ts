import { instagramURL, type SavedInstagram } from "./instagram";

export class InstagramError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Every query is scoped to the trusted dispatch user, never to a client owner ID.
export async function listInstagram(db: D1Database, owner: string) {
  const rows = await db.prepare(
    "SELECT id, username, social_url, created_at FROM instagram_accounts WHERE owner_id = ? ORDER BY created_at DESC, id DESC",
  ).bind(owner).all<SavedInstagram>();
  return rows.results;
}

export function getInstagram(db: D1Database, owner: string, id: string) {
  return db.prepare(
    "SELECT id, username, social_url, created_at FROM instagram_accounts WHERE owner_id = ? AND id = ?",
  ).bind(owner, id).first<SavedInstagram>();
}

export async function limitInstagramWrites(db: D1Database, owner: string, now = Date.now()) {
  const window = Math.floor(now / 3_600_000);
  const row = await db.prepare(`
    INSERT INTO instagram_write_limits (owner_id, window_start, writes) VALUES (?, ?, 1)
    ON CONFLICT(owner_id) DO UPDATE SET
      writes = CASE WHEN window_start = excluded.window_start THEN writes + 1 ELSE 1 END,
      window_start = excluded.window_start RETURNING writes
  `).bind(owner, window).first<{ writes: number }>();
  if (!row || row.writes > 60) throw new InstagramError(429, "Příliš mnoho změn. Zkus to znovu později.");
}

export async function addInstagram(db: D1Database, owner: string, input: string) {
  let account: ReturnType<typeof instagramURL>;
  try { account = instagramURL(input); }
  catch (error) { throw new InstagramError(400, (error as Error).message); }
  await limitInstagramWrites(db, owner);
  // One atomic statement enforces the per-owner limit even for concurrent requests.
  await db.prepare(`
    INSERT INTO instagram_accounts (id, owner_id, username, social_url, created_at)
    SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM instagram_accounts WHERE owner_id = ?) < 10
    ON CONFLICT(owner_id, username) DO NOTHING
  `).bind(crypto.randomUUID(), owner, account.username, account.social_url, Date.now(), owner).run();
  const saved = await db.prepare(
    "SELECT id, username, social_url, created_at FROM instagram_accounts WHERE owner_id = ? AND username = ?",
  ).bind(owner, account.username).first<SavedInstagram>();
  if (!saved) throw new InstagramError(409, "Můžeš uložit nejvýše 10 Instagram účtů. Nejprve některý odeber.");
  return saved;
}

export async function removeInstagram(db: D1Database, owner: string, id: string) {
  await limitInstagramWrites(db, owner);
  // Idempotent and does not reveal whether another user's ID exists.
  await db.prepare("DELETE FROM instagram_accounts WHERE id = ? AND owner_id = ?").bind(id, owner).run();
}
