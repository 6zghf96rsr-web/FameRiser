import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { handleCreatorRead, handleLeaderboardRead, type PublicReadDependencies } from "../lib/core/ranking/public-api-v1";
import { buildGlobalSnapshot, publicGlobalBoardExact } from "../lib/core/ranking/projection-v1";

const ledger = await readFile("contracts/ranking/v1/pilot-ledger.sql", "utf8");
const boundary = await readFile("contracts/ranking/v1/pilot-read-boundary.sql", "utf8");
const key = "synthetic-local-cursor-key-with-32-bytes-minimum";
const listUrl = "http://localhost/api/v1/leaderboards?scope=global&period=all_time&limit=1";
type BoardBody = { rows: { creator_id: string; cash_usd_minor: string;
  fc: string; combined_score_micro: string }[]; next_cursor: string | null };
async function boardBody(response: Response): Promise<BoardBody> {
  return await response.json() as BoardBody;
}

async function pilot<T>(run: (db: PGlite, ids: string[]) => Promise<T>): Promise<T> {
  const db = new PGlite();
  try {
    await db.exec(ledger);
    await db.exec(boundary);
    await db.query("insert into ranking_pilot.launch_campaign values ('launch',$1,1000,0)",
      ["2026-09-28T00:00:00Z"]);
    const ids: string[] = [];
    for (const [index, id] of ["private-a", "private-b"].entries()) {
      await db.query("insert into ranking_pilot.creators(creator_id,registered_at) values($1,$2)",
        [id, "2026-09-20T00:00:00Z"]);
      await db.query("select * from ranking_pilot.verify_social($1,$2,$3,$4,$5)",
        [id, `${id}-account`, "instagram", `${id}-subject`,
          `2026-09-30T${String(index + 9).padStart(2, "0")}:00:00Z`]);
      await db.query("select ranking_pilot.set_publication_consent($1,true)", [id]);
      const row = await db.query<{ public_id: string }>(
        "select public_id::text from ranking_pilot.creators where creator_id=$1", [id]);
      ids.push(row.rows[0].public_id);
    }
    return await run(db, ids);
  } finally { await db.close(); }
}

function deps(db: PGlite, now = Date.now()): PublicReadDependencies {
  return { reader: db, cursorKey: key, rateLimit: async () => true, now: () => now };
}

test("public transport returns only exact aggregates with signed cursor and no-store", async () => pilot(async (db, ids) => {
  await db.exec("set role ranking_pilot_reader");
  try {
    const first = await handleLeaderboardRead(new Request(listUrl), deps(db));
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("Cache-Control"), "no-store");
    const body = await boardBody(first);
    assert.equal(body.rows.length, 1);
    assert.equal(body.rows[0].creator_id, ids[0]);
    assert.equal(body.rows[0].cash_usd_minor, "0");
    assert.equal(body.rows[0].fc, "6");
    assert.equal(body.rows[0].combined_score_micro, "6000000");
    assert.ok(typeof body.next_cursor === "string" && body.next_cursor.length < 512);
    const token = body.next_cursor;
    for (const secret of ["private-a", "private-b", "subject", "source_key", "email", "individual_orders"]) {
      assert.equal(JSON.stringify(body).includes(secret), false, secret);
    }
    const next = await handleLeaderboardRead(new Request(`${listUrl}&cursor=${token}`), deps(db));
    assert.equal(next.status, 200);
    assert.deepEqual((await boardBody(next)).rows.map((row) => row.creator_id), [ids[1]]);
    const tampered = `f${token.slice(1)}`;
    assert.equal((await handleLeaderboardRead(new Request(`${listUrl}&cursor=${tampered}`), deps(db))).status, 422);
    assert.equal((await handleLeaderboardRead(new Request(`${listUrl}&cursor=${token}`),
      deps(db, Date.now() + 600_001))).status, 410);
    assert.equal((await handleLeaderboardRead(new Request(`${listUrl.replace("limit=1", "limit=2")}&cursor=${token}`), deps(db))).status, 422);
    const profile = await handleCreatorRead(new Request(`http://localhost/api/v1/creators/${ids[0]}`), ids[0], deps(db));
    assert.equal(profile.status, 200);
    assert.equal((await profile.json() as { creator_id: string }).creator_id, ids[0]);
  } finally { await db.exec("reset role"); }
}));

test("committed proof loss invalidates cursor and hides profile without exposing cause", async () => pilot(async (db, ids) => {
  const first = await handleLeaderboardRead(new Request(listUrl), deps(db));
  const token = (await boardBody(first)).next_cursor;
  await db.query("select ranking_pilot.revoke_social($1,$2)", ["private-a", "private-a-account"]);
  const stale = await handleLeaderboardRead(new Request(`${listUrl}&cursor=${token}`), deps(db));
  assert.equal(stale.status, 410);
  assert.deepEqual(await stale.json(), { error: "CURSOR_EXPIRED" });
  const hidden = await handleCreatorRead(new Request(`http://localhost/api/v1/creators/${ids[0]}`), ids[0], deps(db));
  assert.equal(hidden.status, 404);
  assert.deepEqual(await hidden.json(), { error: "NOT_PUBLIC" });
  const fresh = await handleLeaderboardRead(new Request(listUrl), deps(db));
  assert.deepEqual((await boardBody(fresh)).rows.map((row) => row.creator_id), [ids[1]]);
}));

test("empty board returns a valid public envelope without a cursor", async () => {
  const db = new PGlite();
  try {
    await db.exec(ledger);
    await db.exec(boundary);
    const result = await handleLeaderboardRead(new Request(listUrl), deps(db));
    assert.equal(result.status, 200);
    const body = await boardBody(result);
    assert.deepEqual(body.rows, []);
    assert.equal(body.next_cursor, null);
    assert.equal(result.headers.get("Cache-Control"), "no-store");
  } finally { await db.close(); }
});

test("consent, moderation and erasure hide public HTTP reads after a committed change", async () => pilot(async (db, ids) => {
  const suppressions = [
    async () => db.query("select ranking_pilot.set_publication_consent($1,false)", ["private-a"]),
    async () => db.query("select ranking_pilot.set_moderation_allowed($1,false)", ["private-a"]),
    async () => db.query("select ranking_pilot.mark_erasure_hidden($1)", ["private-a"]),
  ];
  const restores = [
    async () => db.query("select ranking_pilot.set_publication_consent($1,true)", ["private-a"]),
    async () => db.query("select ranking_pilot.set_moderation_allowed($1,true)", ["private-a"]),
  ];
  for (const [index, suppress] of suppressions.entries()) {
    const before = await handleLeaderboardRead(new Request(listUrl), deps(db));
    const cursor = (await boardBody(before)).next_cursor;
    assert.ok(cursor);
    await suppress();
    const stale = await handleLeaderboardRead(new Request(`${listUrl}&cursor=${cursor}`), deps(db));
    assert.equal(stale.status, 410);
    const profile = await handleCreatorRead(new Request(`http://localhost/api/v1/creators/${ids[0]}`), ids[0], deps(db));
    assert.equal(profile.status, 404);
    assert.deepEqual(await profile.json(), { error: "NOT_PUBLIC" });
    const fresh = await handleLeaderboardRead(new Request(listUrl), deps(db));
    assert.deepEqual((await boardBody(fresh)).rows.map((row) => row.creator_id), [ids[1]]);
    if (index < restores.length) await restores[index]();
  }
}));

test("transport validates inputs and rate gate before reading evidence", async () => {
  let reads = 0;
  const denied: PublicReadDependencies = { cursorKey: key,
    reader: { query: async () => { reads += 1; throw new Error("must not read"); } },
    rateLimit: async () => false };
  assert.equal((await handleLeaderboardRead(new Request(listUrl), denied)).status, 429);
  assert.equal(reads, 0);
  const allowed = { ...denied, rateLimit: async () => true };
  for (const url of [
    `${listUrl}&unknown=x`, `${listUrl}&limit=2`,
    listUrl.replace("scope=global", "scope=country"),
    listUrl.replace("limit=1", "limit=101"),
  ]) {
    assert.equal((await handleLeaderboardRead(new Request(url), allowed)).status, 422);
  }
  assert.equal((await handleCreatorRead(new Request("http://localhost/api/v1/creators/bad"), "bad", allowed)).status, 422);
  const uuid = "00000000-0000-4000-8000-000000000001";
  assert.equal((await handleLeaderboardRead(new Request("http://localhost/api/v1/other?scope=global&period=all_time"), allowed)).status, 404);
  assert.equal((await handleCreatorRead(new Request(`http://localhost/api/v1/creators/${uuid}`),
    "00000000-0000-4000-8000-000000000002", allowed)).status, 404);
  assert.equal(reads, 0);
});

test("exact public projection preserves integers beyond JavaScript safe range", () => {
  const snapshot = buildGlobalSnapshot({ period: "all_time", asOf: "2026-10-01T12:00:00Z",
    projectionRevision: 1, creators: [{ creatorId: "public-id", eligibility: {
      verifiedAccount: true, consentToPublish: true, moderationAllowed: true, notDeleted: true,
    }, cash: [{ paymentId: "large", grossUsdMinor: 1_000_000_000_000,
      effectiveAt: "2026-10-01T10:00:00Z" }], fc: [] }] });
  const row = publicGlobalBoardExact(snapshot).rows[0];
  assert.equal(row.cash_usd_minor, "1000000000000");
  assert.equal(row.combined_score_micro, "10000000000000000");
});
