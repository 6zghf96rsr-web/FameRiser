import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { handleDemoAccounts } from "../lib/rankme/demo-accounts-api";
import { ensureDemoOwner, demoAccountsSnapshot, mutateDemoAccount, limitDemoWrites } from "../lib/rankme/demo-accounts-store";
import type { DemoAccounts } from "../lib/rankme/demo-accounts";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
  const prepare = (sql: string, args: (string | number)[] = []) => {
    const statement = sqlite.prepare(sql);
    const execute = () => {
      const results = statement.all(...args);
      return { results, success: true, meta: { changes: Number(sqlite.prepare("SELECT changes() AS n").get()!.n) } };
    };
    return { bind: (...values: (string | number)[]) => prepare(sql, values),
      all: async () => execute(), first: async () => statement.get(...args) ?? null,
      run: async () => execute(), execute };
  };
  const db = { prepare, batch: async (statements: ReturnType<typeof prepare>[]) => {
    sqlite.exec("BEGIN");
    try { const results = statements.map((s) => s.execute()); sqlite.exec("COMMIT"); return results; }
    catch (e) { sqlite.exec("ROLLBACK"); throw e; }
  } } as unknown as D1Database;
  return { db, sqlite };
}
const alice = { userId: "alice", email: "alice@example.com", displayName: "Alice" };
const bob = { userId: "bob", email: "bob@example.com", displayName: "Bob" };
const create = { action: "create", display_name: "Jana Demo", email: "jana@rankme.test", role: "user" } as const;
function request(body?: unknown, origin = "https://rankme.test") {
  return new Request("https://rankme.test/api/demo/accounts", body === undefined ? {} : {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
function context(db: D1Database, user: typeof alice | null = alice, demo = true) {
  return { demo, user, origin: "https://rankme.test", database: () => db };
}
async function json(response: Response) { return await response.json() as DemoAccounts; }

test("demo API denies unauthenticated, production and cross-origin access before opening the database", async () => {
  const ctx = { ...context({} as D1Database), database: () => { throw new Error("must not access DB"); } };
  assert.equal((await handleDemoAccounts(request(), { ...ctx, user: null })).status, 401);
  assert.equal((await handleDemoAccounts(request(create), { ...ctx, demo: false })).status, 404);
  assert.equal((await handleDemoAccounts(request(create, "https://foreign.test"), ctx)).status, 403);
  assert.equal((await handleDemoAccounts(request(create, "null"), ctx)).status, 403);
  assert.equal((await handleDemoAccounts(request(create), { ...ctx, origin: undefined })).status, 503);
  for (const extra of [{ owner_id: "bob" }, { kind: "owner" }, { verified: true }, { total_paid: 5000 }, { role: "superadmin" }]) {
    assert.equal((await handleDemoAccounts(request({ ...create, ...extra }), ctx)).status, 400);
  }
  assert.equal((await handleDemoAccounts(request({ ...create, email: "real@example.com" }), ctx)).status, 400);
  const large = request({ ...create, display_name: "a".repeat(5000) });
  assert.equal((await handleDemoAccounts(large, ctx)).status, 413);
  assert.equal((await handleDemoAccounts(new Request("https://rankme.test/api", { method: "POST", headers: { origin: ctx.origin, "content-type": "text/plain" }, body: "bad" }), ctx)).status, 415);
  assert.equal((await handleDemoAccounts(new Request("https://rankme.test/api", { method: "POST", headers: { origin: ctx.origin, "content-type": "application/json" }, body: "{" }), ctx)).status, 400);
});

test("demo account lifecycle persists edits, roles, blocking, deletion and private audit", async () => {
  const { db, sqlite } = database();
  try {
    const initial = await handleDemoAccounts(request(), context(db));
    assert.equal(initial.status, 200);
    assert.equal(initial.headers.get("cache-control"), "private, no-store");
    const me = (await json(initial)).me;
    const made = await json(await handleDemoAccounts(request(create), context(db)));
    const target = made.users.find((u) => u.kind === "test")!;
    assert.equal(made.events.length, 1);
    assert.equal(made.events[0].action, "created");
    assert.equal((await handleDemoAccounts(request({ ...create, action: "update", id: target.id, role: "moderator", display_name: "Jana Upravená" }), context(db))).status, 200);
    await handleDemoAccounts(request({ action: "status", id: target.id, status: "blocked" }), context(db));
    let fresh = await json(await handleDemoAccounts(request(), context(db)));
    assert.equal(fresh.me.id, me.id);
    assert.equal(fresh.users.find((u) => u.id === target.id)?.status, "blocked");
    assert.equal(fresh.users.find((u) => u.id === target.id)?.role, "moderator");
    assert.equal(fresh.users.find((u) => u.id === target.id)?.display_name, "Jana Upravená");
    await handleDemoAccounts(request({ action: "status", id: target.id, status: "active" }), context(db));
    await handleDemoAccounts(request({ action: "self", display_name: "Správce RankMe" }), context(db));
    await handleDemoAccounts(request({ action: "delete", id: target.id }), context(db));
    fresh = await json(await handleDemoAccounts(request(), context(db)));
    assert.equal(fresh.users.length, 1);
    assert.equal(fresh.me.display_name, "Správce RankMe");
    assert.deepEqual(fresh.events.map((e) => e.action).sort(), ["created", "updated", "blocked", "unblocked", "self_updated", "deleted"].sort());
    assert.equal((await handleDemoAccounts(request({ action: "delete", id: target.id }), context(db))).status, 404);
    assert.equal((await demoAccountsSnapshot(db, alice.userId)).events.length, 6);
  } finally { sqlite.close(); }
});

test("demo workspaces cannot read, edit or delete each other's records or change owner access", async () => {
  const { db, sqlite } = database();
  try {
    const a = await json(await handleDemoAccounts(request(create), context(db)));
    const b = await json(await handleDemoAccounts(request(), context(db, bob)));
    assert.equal(b.users.length, 1);
    assert.equal(b.events.length, 0);
    const id = a.users.find((u) => u.kind === "test")!.id;
    for (const body of [{ ...create, action: "update", id }, { action: "delete", id }, { action: "status", id, status: "blocked" }]) {
      assert.equal((await handleDemoAccounts(request(body), context(db, bob))).status, 404);
    }
    for (const body of [{ ...create, action: "update", id: a.me.id }, { action: "delete", id: a.me.id }, { action: "status", id: a.me.id, status: "blocked" }]) {
      assert.equal((await handleDemoAccounts(request(body), context(db))).status, 403);
    }
    const aAgain = await demoAccountsSnapshot(db, alice.userId);
    assert.equal(aAgain.users.length, 2);
    assert.equal(aAgain.events.length, 1);
    assert.equal(aAgain.me.status, "active");
    assert.equal(aAgain.me.role, "admin");
    assert.equal((await handleDemoAccounts(request(create), context(db, bob))).status, 200);
    assert.equal((await demoAccountsSnapshot(db, bob.userId)).users.length, 2);
    assert.ok(!JSON.stringify(await demoAccountsSnapshot(db, bob.userId)).includes(a.me.id));
    assert.throws(() => sqlite.prepare("UPDATE demo_users SET status = 'blocked' WHERE id = ?").run(a.me.id), /CHECK constraint/);
  } finally { sqlite.close(); }
});

test("duplicate test email conflicts roll back and failed audit rolls back the account write", async () => {
  const { db, sqlite } = database();
  try {
    await handleDemoAccounts(request(create), context(db));
    assert.equal((await handleDemoAccounts(request({ ...create, email: "JANA@RANKME.TEST" }), context(db))).status, 409);
    assert.equal((await demoAccountsSnapshot(db, alice.userId)).events.length, 1);
    sqlite.exec("CREATE TRIGGER fail_demo_audit BEFORE INSERT ON demo_user_events BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
    await assert.rejects(mutateDemoAccount(db, alice.userId, { ...create, email: "other@rankme.test" }), /audit unavailable/);
    assert.equal((await demoAccountsSnapshot(db, alice.userId)).users.length, 2);
  } finally { sqlite.close(); }
});

test("demo limits are enforced in SQL and rate windows are private and reset", async () => {
  const { db, sqlite } = database();
  try {
    await ensureDemoOwner(db, alice);
    for (let i = 0; i < 100; i++) await mutateDemoAccount(db, alice.userId, { ...create, email: `user${i}@rankme.test` });
    await assert.rejects(mutateDemoAccount(db, alice.userId, { ...create, email: "extra@rankme.test" }), /nejvýše 100/);
    assert.equal((await demoAccountsSnapshot(db, alice.userId)).users.length, 101);
    assert.equal((await demoAccountsSnapshot(db, alice.userId)).events.length, 50);
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM demo_user_events").get()!.n, 100);
    await ensureDemoOwner(db, bob);
    await mutateDemoAccount(db, bob.userId, create);
    for (let i = 0; i < 120; i++) await limitDemoWrites(db, "limited", 0);
    await assert.rejects(limitDemoWrites(db, "limited", 0), /Příliš mnoho/);
    await limitDemoWrites(db, "another", 0);
    await limitDemoWrites(db, "limited", 3_600_000);
  } finally { sqlite.close(); }
});
