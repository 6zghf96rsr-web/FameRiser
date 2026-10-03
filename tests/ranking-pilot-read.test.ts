import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  quoteCurrent,
  readGlobalPage,
  readPublicCreator,
  revalidateQuote,
} from "../lib/core/ranking/pilot-read-v1";

const ledger = await readFile("contracts/ranking/v1/pilot-ledger.sql", "utf8");
const boundary = await readFile("contracts/ranking/v1/pilot-read-boundary.sql", "utf8");

async function pilot<T>(run: (db: PGlite) => Promise<T>): Promise<T> {
  const db = new PGlite();
  try {
    await db.exec(ledger);
    await db.exec(boundary);
    await db.query("insert into ranking_pilot.launch_campaign values ('launch',$1,1000,0)",
      ["2026-10-01T00:00:00Z"]);
    return await run(db);
  } finally {
    await db.close();
  }
}

async function addPublicCreator(db: PGlite, id: string, accountAt: string): Promise<string> {
  await db.query("insert into ranking_pilot.creators(creator_id,registered_at) values($1,$2)",
    [id, "2026-09-20T00:00:00Z"]);
  await db.query("select * from ranking_pilot.verify_social($1,$2,$3,$4,$5)",
    [id, `${id}-account`, "instagram", `${id}-subject`, accountAt]);
  await db.query("select ranking_pilot.set_publication_consent($1,true)", [id]);
  const result = await db.query<{ public_id: string }>(
    "select public_id::text from ranking_pilot.creators where creator_id=$1", [id]);
  return result.rows[0].public_id;
}

async function revision(db: PGlite): Promise<number> {
  const result = await db.query<{ revision: string }>(
    "select revision::text from ranking_pilot.projection_clock");
  return Number(result.rows[0].revision);
}

test("read role sees only eligible UUIDs and cannot write or call unrelated functions", async () => pilot(async (db) => {
  const publicId = await addPublicCreator(db, "private-a", "2026-09-30T09:00:00Z");
  await db.query("select ranking_pilot.record_cash($1,$2,$3,$4,$5,$6)",
    ["dodo:secret-payment", "private-a", 500,
      "2026-09-30T09:01:00Z", "2026-09-30T09:02:00Z", false]);

  await db.exec("set role ranking_pilot_reader");
  try {
    const evidence = (await db.query<{ evidence: unknown }>(
      "select ranking_pilot.read_projection_evidence() as evidence")).rows[0].evidence;
    const json = JSON.stringify(evidence);
    assert.ok(json.includes(publicId));
    for (const secret of ["private-a", "secret-payment", "subject", "source_key", "provider_success_at"]) {
      assert.equal(json.includes(secret), false, secret);
    }
    await assert.rejects(() => db.query("select * from ranking_pilot.creators"), /permission denied/);
    await assert.rejects(() => db.query(
      "update ranking_pilot.creators set consent_to_publish=false where creator_id='private-a'"), /permission denied/);
    await assert.rejects(() => db.query("select ranking_pilot.set_publication_consent('private-a',false)"),
      /permission denied/);
    const board = await readGlobalPage(db, { period: "all_time", pageSize: 10 });
    assert.equal(board.status, "OK");
    if (board.status === "OK") assert.equal(board.page.rows[0].creator_id, publicId);
  } finally {
    await db.exec("reset role");
  }
}));

test("a revocation after page one rejects its cursor, hides the creator and stales its quote", async () => pilot(async (db) => {
  const a = await addPublicCreator(db, "creator-a", "2026-09-30T09:00:00Z");
  const b = await addPublicCreator(db, "creator-b", "2026-09-30T10:00:00Z");
  const first = await readGlobalPage(db, { period: "all_time", pageSize: 1 });
  assert.equal(first.status, "OK");
  if (first.status !== "OK") throw new Error("Missing first page");
  assert.equal(first.page.rows[0].creator_id, a);
  assert.ok(first.nextCursor);
  const quote = await quoteCurrent(db, a, b);
  assert.deepEqual(await revalidateQuote(db, quote), { status: "CURRENT" });

  const before = await revision(db);
  await db.query("select ranking_pilot.revoke_social($1,$2)", ["creator-a", "creator-a-account"]);
  assert.equal(await revision(db), before + 1);
  assert.deepEqual(await readGlobalPage(db, {
    period: "all_time", pageSize: 1, cursor: first.nextCursor,
  }), { status: "STALE_CURSOR" });
  assert.deepEqual(await readPublicCreator(db, a), { status: "NOT_PUBLIC" });
  assert.deepEqual(await revalidateQuote(db, quote), { status: "STALE_QUOTE" });
  const fresh = await readGlobalPage(db, { period: "all_time", pageSize: 10 });
  assert.equal(fresh.status, "OK");
  if (fresh.status === "OK") assert.deepEqual(fresh.page.rows.map((row) => row.creator_id), [b]);
}));

test("consent, moderation and erasure suppression override old pages and profile reads", async () => pilot(async (db) => {
  const id = await addPublicCreator(db, "visibility", "2026-09-30T09:00:00Z");
  const other = await addPublicCreator(db, "other", "2026-09-30T10:00:00Z");
  const suppressions = [
    async () => db.query("select ranking_pilot.set_publication_consent($1,false)", ["visibility"]),
    async () => db.query("select ranking_pilot.set_moderation_allowed($1,false)", ["visibility"]),
    async () => db.query("select ranking_pilot.mark_erasure_hidden($1)", ["visibility"]),
  ];
  const restorations = [
    async () => db.query("select ranking_pilot.set_publication_consent($1,true)", ["visibility"]),
    async () => db.query("select ranking_pilot.set_moderation_allowed($1,true)", ["visibility"]),
  ];
  for (const [index, suppress] of suppressions.entries()) {
    const page = await readGlobalPage(db, { period: "all_time", pageSize: 1 });
    assert.equal(page.status, "OK");
    if (page.status !== "OK") throw new Error("Missing page");
    assert.equal(page.page.rows[0].creator_id, id);
    assert.ok(page.nextCursor);
    const quote = await quoteCurrent(db, id, other);
    await suppress();
    assert.deepEqual(await readGlobalPage(db, {
      period: "all_time", pageSize: 1, cursor: page.nextCursor,
    }), { status: "STALE_CURSOR" });
    assert.deepEqual(await readPublicCreator(db, id), { status: "NOT_PUBLIC" });
    assert.deepEqual(await revalidateQuote(db, quote), { status: "STALE_QUOTE" });
    const fresh = await readGlobalPage(db, { period: "all_time", pageSize: 10 });
    assert.equal(fresh.status, "OK");
    if (fresh.status === "OK") assert.deepEqual(fresh.page.rows.map((row) => row.creator_id), [other]);
    if (index < restorations.length) await restorations[index]();
  }
}));

test("read boundary rejects a long-lived repeatable-read transaction", async () => pilot(async (db) => {
  await addPublicCreator(db, "old-snapshot", "2026-09-30T09:00:00Z");
  await db.exec("begin transaction isolation level repeatable read read only");
  try {
    await assert.rejects(() => readGlobalPage(db, { period: "all_time", pageSize: 10 }),
      /fresh READ COMMITTED statement/);
  } finally {
    await db.exec("rollback");
  }
  const fresh = await readGlobalPage(db, { period: "all_time", pageSize: 10 });
  assert.equal(fresh.status, "OK");
}));

test("score change invalidates a cursor so a ranking reorder cannot duplicate a row", async () => pilot(async (db) => {
  const a = await addPublicCreator(db, "score-a", "2026-09-30T09:00:00Z");
  const b = await addPublicCreator(db, "score-b", "2026-09-30T10:00:00Z");
  const first = await readGlobalPage(db, { period: "all_time", pageSize: 1 });
  assert.equal(first.status, "OK");
  if (first.status !== "OK") throw new Error("Missing first page");
  assert.equal(first.page.rows[0].creator_id, a);
  assert.ok(first.nextCursor);
  const secondBeforeChange = await readGlobalPage(db, {
    period: "all_time", pageSize: 1, cursor: first.nextCursor,
  });
  assert.equal(secondBeforeChange.status, "OK");
  if (secondBeforeChange.status === "OK") {
    assert.deepEqual(secondBeforeChange.page.rows.map((row) => row.creator_id), [b]);
  }
  await db.query("select ranking_pilot.record_cash($1,$2,$3,$4,$5,$6)",
    ["dodo:score-b", "score-b", 500,
      "2026-10-01T10:00:00Z", "2026-10-01T10:01:00Z", false]);
  assert.deepEqual(await readGlobalPage(db, {
    period: "all_time", pageSize: 1, cursor: first.nextCursor,
  }), { status: "STALE_CURSOR" });
  const fresh = await readGlobalPage(db, { period: "all_time", pageSize: 10 });
  assert.equal(fresh.status, "OK");
  if (fresh.status === "OK") assert.deepEqual(fresh.page.rows.map((row) => row.creator_id), [b, a]);
}));

test("revision and outbox are transactional; no-op replay does not advance them", async () => pilot(async (db) => {
  await addPublicCreator(db, "revision", "2026-09-30T09:00:00Z");
  const before = await revision(db);
  const noOp = await db.query<{ set_publication_consent: boolean }>(
    "select ranking_pilot.set_publication_consent('revision',true)");
  assert.equal(noOp.rows[0].set_publication_consent, false);
  await db.query("select ranking_pilot.record_cash($1,$2,$3,$4,$5,$6)",
    ["dodo:revision", "revision", 500,
      "2026-09-30T10:00:00Z", "2026-09-30T10:01:00Z", false]);
  const afterPayment = await revision(db);
  assert.equal(afterPayment, before + 1);
  const replay = await db.query<{ record_cash: boolean }>(
    "select ranking_pilot.record_cash($1,$2,$3,$4,$5,$6)",
    ["dodo:revision", "revision", 500,
      "2026-09-30T10:00:00Z", "2026-09-30T10:02:00Z", false]);
  assert.equal(replay.rows[0].record_cash, false);
  assert.equal(await revision(db), afterPayment);

  await db.exec("begin");
  await db.query("select ranking_pilot.set_moderation_allowed('revision',false)");
  assert.equal(await revision(db), afterPayment + 1);
  await db.exec("rollback");
  assert.equal(await revision(db), afterPayment);
  const outbox = await db.query<{ revision: string }>(
    "select revision::text from ranking_pilot.projection_outbox order by revision");
  assert.equal(outbox.rows.at(-1)?.revision, String(afterPayment));
  assert.equal(outbox.rows.length, afterPayment - 1);
}));

test("application write roles use only their functions; payment role cannot alter visibility", async () => pilot(async (db) => {
  await addPublicCreator(db, "role-creator", "2026-09-30T09:00:00Z");
  await db.exec("set role ranking_pilot_payment_writer");
  try {
    await assert.rejects(() => db.query(
      "insert into ranking_pilot.cash_payments values ('raw','role-creator',500,now(),now(),false,'confirmed',now(),null)"),
    /permission denied/);
    await assert.rejects(() => db.query("select ranking_pilot.set_moderation_allowed('role-creator',false)"),
      /permission denied/);
    const result = await db.query<{ record_cash: boolean }>(
      "select ranking_pilot.record_cash($1,$2,$3,$4,$5,$6)",
      ["dodo:role", "role-creator", 500,
        "2026-09-30T10:00:00Z", "2026-09-30T10:01:00Z", false]);
    assert.equal(result.rows[0].record_cash, true);
  } finally {
    await db.exec("reset role");
  }
}));
