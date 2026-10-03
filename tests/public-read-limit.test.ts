import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createPublicReadRateLimit } from "../lib/core/ranking/public-read-limit-v1";

const secret = "a-distinct-secret-for-public-read-limiting-0123456789";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
  }
  const prepare = (sql: string, args: (string | number)[] = []) => ({
    bind: (...values: (string | number)[]) => prepare(sql, values),
    execute: () => {
      const results = sqlite.prepare(sql).all(...args);
      return { success: true, results };
    },
  });
  const db = { prepare, batch: async (statements: ReturnType<typeof prepare>[]) => {
    sqlite.exec("BEGIN");
    try {
      const result = statements.map((statement) => statement.execute());
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  } } as unknown as D1Database;
  return { db, sqlite };
}

function request(ip?: string, forwarded?: string) {
  const headers = new Headers();
  if (ip) headers.set("cf-connecting-ip", ip);
  if (forwarded) headers.set("x-forwarded-for", forwarded);
  return new Request("https://fameriser.com/api/v1/leaderboards", { headers });
}

test("one durable budget is shared across instances and both public endpoints", async () => {
  const { db, sqlite } = database();
  try {
    const first = createPublicReadRateLimit(db, secret, () => 1_800_000);
    const second = createPublicReadRateLimit(db, secret, () => 1_800_000);
    const visitor = request("203.0.113.8");
    for (let index = 0; index < 60; index++) {
      assert.equal(await (index % 2 ? first : second)(visitor), true);
    }
    assert.equal(await second(visitor), false);
    assert.equal(await first(new Request("https://fameriser.com/api/v1/creators/uuid", {
      headers: { "cf-connecting-ip": "203.0.113.8" },
    })), false);
    assert.equal(await first(request("203.0.113.9")), true);
    assert.equal(sqlite.prepare("SELECT requests FROM public_read_limits ORDER BY requests DESC LIMIT 1").get()!.requests, 60);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM public_read_limits WHERE subject_hash LIKE '%203.0.113%'").get()!.n, 0);
    assert.equal(await createPublicReadRateLimit(db, secret, () => 1_860_000)(visitor), true);
  } finally { sqlite.close(); }
});

test("untrusted or absent client identity and broken storage fail closed", async () => {
  const { db, sqlite } = database();
  try {
    const limit = createPublicReadRateLimit(db, secret, () => 0);
    await assert.rejects(limit(request(undefined, "203.0.113.8")), /Trusted visitor/);
    await assert.rejects(limit(request("203.0.113.8, 203.0.113.9")), /Trusted visitor/);
    await assert.rejects(limit(request("garbage")), /Trusted visitor/);
    await assert.rejects(createPublicReadRateLimit(db, "short", () => 0)(request("203.0.113.8")), /not configured/);
    await assert.rejects(createPublicReadRateLimit(undefined, secret, () => 0)(request("203.0.113.8")), /not configured/);
    await assert.rejects(createPublicReadRateLimit(db, secret, () => -1)(request("203.0.113.8")), /clock/);
    sqlite.exec("DROP TABLE public_read_limits");
    await assert.rejects(limit(request("203.0.113.8")), /no such table/);
  } finally { sqlite.close(); }
});

test("old pseudonymous limiter rows are pruned and daily keys rotate", async () => {
  const { db, sqlite } = database();
  try {
    const visitor = request("2001:db8::1");
    assert.equal(await createPublicReadRateLimit(db, secret, () => 0)(visitor), true);
    const oldKey = sqlite.prepare("SELECT subject_hash FROM public_read_limits").get()!.subject_hash;
    assert.equal(await createPublicReadRateLimit(db, secret, () => 3 * 86_400_000)(visitor), true);
    const rows = sqlite.prepare("SELECT subject_hash FROM public_read_limits").all();
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].subject_hash, oldKey);
  } finally { sqlite.close(); }
});
