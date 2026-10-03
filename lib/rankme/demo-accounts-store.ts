import { DemoAccountError, type DemoAccountInput, type DemoAccounts, type DemoEvent, type DemoIdentity, type DemoUser } from "./demo-accounts";

const columns = "id, kind, display_name, email, role, status, created_at, updated_at";
export const DEMO_USER_LIMIT = 100;

// The workspace comes exclusively from the trusted sign-in identity.
export async function ensureDemoOwner(db: D1Database, user: DemoIdentity) {
  const now = Date.now();
  await db.prepare(`INSERT INTO demo_users
    (id, owner_id, kind, display_name, email, role, status, created_at, updated_at)
    VALUES (?, ?, 'owner', ?, ?, 'admin', 'active', ?, ?)
    ON CONFLICT(owner_id) WHERE kind = 'owner' DO NOTHING
  `).bind(crypto.randomUUID(), user.userId, user.displayName.slice(0, 80), user.email.toLowerCase(), now, now).run();
}

export async function demoAccountsSnapshot(db: D1Database, owner: string): Promise<DemoAccounts> {
  const results = await db.batch([
    db.prepare(`SELECT ${columns} FROM demo_users WHERE owner_id = ? ORDER BY kind, created_at DESC, id`).bind(owner),
    db.prepare("SELECT id, target_id, action, created_at FROM demo_user_events WHERE owner_id = ? ORDER BY created_at DESC, id DESC LIMIT 50").bind(owner),
  ]);
  const users = results[0].results as unknown as DemoUser[];
  const me = users.find((u) => u.kind === "owner");
  if (!me) throw new DemoAccountError(503, "Účet se nepodařilo načíst. Zkus obnovit stránku.");
  return { me, users, events: results[1].results as unknown as DemoEvent[], limit: DEMO_USER_LIMIT };
}

export async function limitDemoWrites(db: D1Database, owner: string, now = Date.now()) {
  const row = await db.prepare(`INSERT INTO demo_write_limits (owner_id, window_start, writes) VALUES (?, ?, 1)
    ON CONFLICT(owner_id) DO UPDATE SET
      writes = CASE WHEN window_start = excluded.window_start THEN writes + 1 ELSE 1 END,
      window_start = excluded.window_start RETURNING writes
  `).bind(owner, Math.floor(now / 3_600_000)).first<{ writes: number }>();
  if (!row || row.writes > 120) throw new DemoAccountError(429, "Příliš mnoho změn. Zkus to znovu později.");
}

export async function mutateDemoAccount(db: D1Database, owner: string, input: DemoAccountInput) {
  const now = Date.now();
  let id: string;
  let statement: D1PreparedStatement;
  let action: DemoEvent["action"];
  if (input.action === "create") {
    id = crypto.randomUUID();
    action = "created";
    statement = db.prepare(`INSERT INTO demo_users
      (id, owner_id, kind, display_name, email, role, status, created_at, updated_at)
      SELECT ?, ?, 'test', ?, ?, ?, 'active', ?, ?
      WHERE (SELECT COUNT(*) FROM demo_users WHERE owner_id = ? AND kind = 'test') < ?
    `).bind(id, owner, input.display_name, input.email, input.role, now, now, owner, DEMO_USER_LIMIT);
  } else if (input.action === "self") {
    const me = await db.prepare("SELECT id FROM demo_users WHERE owner_id = ? AND kind = 'owner'").bind(owner).first<{ id: string }>();
    if (!me) throw new DemoAccountError(404, "Účet není dostupný.");
    id = me.id;
    action = "self_updated";
    statement = db.prepare("UPDATE demo_users SET display_name = ?, updated_at = ? WHERE owner_id = ? AND id = ? AND kind = 'owner'")
      .bind(input.display_name, now, owner, id);
  } else {
    id = input.id;
    // Predicates also stay in the writes to protect against concurrent changes.
    const target = await db.prepare("SELECT kind FROM demo_users WHERE owner_id = ? AND id = ?").bind(owner, id).first<{ kind: string }>();
    if (!target) throw new DemoAccountError(404, "Účet není dostupný.");
    if (target.kind !== "test") throw new DemoAccountError(403, "Vlastní přístup správce nelze změnit ani smazat. Jméno upravíš v Můj účet.");
    if (input.action === "update") {
      action = "updated";
      statement = db.prepare("UPDATE demo_users SET display_name = ?, email = ?, role = ?, updated_at = ? WHERE owner_id = ? AND id = ? AND kind = 'test'")
        .bind(input.display_name, input.email, input.role, now, owner, id);
    } else if (input.action === "status") {
      action = input.status === "blocked" ? "blocked" : "unblocked";
      statement = db.prepare("UPDATE demo_users SET status = ?, updated_at = ? WHERE owner_id = ? AND id = ? AND kind = 'test'")
        .bind(input.status, now, owner, id);
    } else {
      action = "deleted";
      statement = db.prepare("DELETE FROM demo_users WHERE owner_id = ? AND id = ? AND kind = 'test'").bind(owner, id);
    }
  }
  // D1 batch is one transaction: a change and its audit record succeed together.
  // changes() refers to the immediately preceding write on the same connection.
  const result = await db.batch([
    statement,
    db.prepare(`INSERT INTO demo_user_events (id, owner_id, target_id, action, created_at)
      SELECT ?, ?, ?, ?, ? WHERE changes() > 0`).bind(crypto.randomUUID(), owner, id, action, now),
  ]);
  if (!result[0].meta.changes) throw new DemoAccountError(input.action === "create" ? 409 : 404,
    input.action === "create" ? "Demo může mít nejvýše 100 testovacích účtů. Nejprve některý smaž." : "Účet už není dostupný.");
}
