import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { instagramURL } from "../lib/rankme/instagram";
import { addInstagram, listInstagram, getInstagram, removeInstagram, limitInstagramWrites } from "../lib/rankme/instagram-store";

// Exercise the real production SQL against SQLite, the D1 storage engine.
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("drizzle/0000_blue_vulture.sql", "utf8"));
  const db = { prepare(sql: string) {
    const statement = sqlite.prepare(sql);
    return { bind(...args: (string | number)[]) { return {
      all: async () => ({ results: statement.all(...args) }),
      first: async () => statement.get(...args) ?? null,
      run: async () => statement.run(...args),
    }; } };
  } } as unknown as D1Database;
  return { db, sqlite };
}

test("Instagram accepts handles and share links but rejects posts, redirects and unsafe URLs", () => {
  for (const value of [" @Moje.Jmeno ", "moje.jmeno", "instagram.com/Moje.Jmeno", "https://www.instagram.com/Moje.Jmeno/?igsh=tracking#bio"]) {
    assert.deepEqual(instagramURL(value), { username: "moje.jmeno", social_url: "https://instagram.com/moje.jmeno" });
  }
  for (const value of ["https://instagram.com.evil.test/a", "https://evil.test/a", "https://instagram.com/p/post", "https://instagram.com/reels/video", "https://instagram.com/a?next=https://evil.test", "javascript:alert(1)", "http://instagram.com/a", "@bad..name", "@.bad", "@bad.", "@two names"]) {
    assert.throws(() => instagramURL(value), value);
  }
});

test("saved Instagram accounts are private, stable on retry and removable only by their owner", async () => {
  const { db, sqlite } = database();
  try {
    const mine = await addInstagram(db, "owner-a", "@Moje.Jmeno");
    assert.equal((await addInstagram(db, "owner-a", "https://instagram.com/moje.jmeno/?igsh=abc")).id, mine.id);
    assert.equal((await listInstagram(db, "owner-a")).length, 1);
    assert.deepEqual(await listInstagram(db, "owner-b"), []);
    assert.equal((await getInstagram(db, "owner-a", mine.id))?.username, "moje.jmeno");
    assert.equal(await getInstagram(db, "owner-b", mine.id), null);
    await removeInstagram(db, "owner-b", mine.id);
    assert.equal((await listInstagram(db, "owner-a")).length, 1);
    // Saving a public address is not an exclusive ownership claim.
    const theirs = await addInstagram(db, "owner-b", "moje.jmeno");
    assert.notEqual(theirs.id, mine.id);
    assert.deepEqual(Object.keys(mine).sort(), ["created_at", "id", "social_url", "username"]);
    await removeInstagram(db, "owner-a", mine.id);
    assert.deepEqual(await listInstagram(db, "owner-a"), []);
    assert.equal(await getInstagram(db, "owner-a", mine.id), null);
    assert.equal((await listInstagram(db, "owner-b")).length, 1);
  } finally { sqlite.close(); }
});

test("Instagram enforces account limits atomically and write limits per identity", async () => {
  const { db, sqlite } = database();
  try {
    await Promise.all(Array.from({ length: 10 }, (_, i) => addInstagram(db, "owner-a", `user${i}`)));
    await assert.rejects(addInstagram(db, "owner-a", "eleventh"), /nejvýše 10/);
    assert.equal((await listInstagram(db, "owner-a")).length, 10);
    assert.ok(await addInstagram(db, "owner-a", "user0"));
    await addInstagram(db, "owner-b", "eleventh");
    for (let i = 0; i < 60; i++) await limitInstagramWrites(db, "limited", 0);
    await assert.rejects(limitInstagramWrites(db, "limited", 0), /Příliš mnoho/);
    await limitInstagramWrites(db, "limited", 3_600_000);
    await limitInstagramWrites(db, "other", 0);
  } finally { sqlite.close(); }
});
