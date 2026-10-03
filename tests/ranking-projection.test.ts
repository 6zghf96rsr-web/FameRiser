import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import golden from "../contracts/ranking/v1/golden.json";
import {
  buildGlobalSnapshot,
  publicCreator,
  publicGlobalBoard,
  quoteFromSnapshot,
  type CreatorProjectionSource,
} from "../lib/core/ranking/projection-v1";

const schema = await readFile("contracts/ranking/v1/pilot-ledger.sql", "utf8");
const allowed = { verifiedAccount: true, consentToPublish: true, moderationAllowed: true, notDeleted: true };

function fixture<Input, Expected>(id: string): { input: Input; expected: Expected } {
  const value = golden.cases.find((item) => item.id === id);
  assert.ok(value, `Missing golden case: ${id}`);
  return value as unknown as { input: Input; expected: Expected };
}

async function rows<T>(db: PGlite, sql: string, args: unknown[] = []): Promise<T[]> {
  return (await db.query(sql, args)).rows as T[];
}

async function pilot<T>(run: (db: PGlite) => Promise<T>, campaignStart = "2026-10-01T00:00:00Z"): Promise<T> {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.query("insert into ranking_pilot.launch_campaign values ('launch',$1,1000,0)", [campaignStart]);
    return await run(db);
  } finally {
    await db.close();
  }
}

async function addCreator(db: PGlite, id: string) {
  await db.query("insert into ranking_pilot.creators(creator_id,registered_at) values($1,'2026-09-20T00:00:00Z')", [id]);
}

async function verify(db: PGlite, creator: string, account: string, provider: string, subject: string, at: string) {
  await db.query("select * from ranking_pilot.verify_social($1,$2,$3,$4,$5)", [creator, account, provider, subject, at]);
}

async function ledgerSources(db: PGlite): Promise<CreatorProjectionSource[]> {
  const creators = await rows<{ creator_id: string }>(db, "select creator_id from ranking_pilot.creators order by creator_id");
  const verified = new Set((await rows<{ creator_id: string }>(db,
    "select creator_id from ranking_pilot.verified_creators")).map((item) => item.creator_id));
  return Promise.all(creators.map(async (creator) => {
    const cash = await rows<{ source_key: string; gross_usd_minor: string | number; ranking_effective_at: Date }>(db,
      "select source_key,gross_usd_minor,ranking_effective_at from ranking_pilot.cash_payments where creator_id=$1 and status='confirmed'",
      [creator.creator_id]);
    const fc = await rows<{ source_key: string; amount_fc: number; granted_at: Date }>(db,
      "select source_key,amount_fc,granted_at from ranking_pilot.fc_grants where creator_id=$1", [creator.creator_id]);
    return {
      creatorId: creator.creator_id,
      eligibility: { ...allowed, verifiedAccount: verified.has(creator.creator_id) },
      cash: cash.map((item) => ({ paymentId: item.source_key, grossUsdMinor: Number(item.gross_usd_minor),
        effectiveAt: item.ranking_effective_at.toISOString() })),
      fc: fc.map((item) => ({ grantId: item.source_key, amountFc: item.amount_fc,
        grantedAt: item.granted_at.toISOString() })),
    };
  }));
}

test("golden: public Global projection separates cash and FC with a strict field allowlist", async () => pilot(async (db) => {
  const { input, expected } = fixture<{
    creator_id: string; confirmed_cash_gross_usd_minor: number; active_fc: number;
    projection_revision: number; as_of: string;
  }, { public_fields: Record<string, string | number>; excluded_public_fields: string[] }>(
    "public-projection-discloses-cash-and-fc-safely",
  );
  await addCreator(db, input.creator_id);
  await verify(db, input.creator_id, "ig-public", "instagram", "subject-public", "2026-09-30T10:00:00Z");
  await db.query("select ranking_pilot.record_cash($1,$2,$3,$4,$5,$6)", [
    "dodo:pay-public", input.creator_id, input.confirmed_cash_gross_usd_minor,
    "2026-10-01T10:00:00Z", "2026-10-01T10:01:00Z", false,
  ]);
  const sources = await ledgerSources(db);
  assert.equal(sources[0].fc.reduce((sum, grant) => sum + grant.amountFc, 0), input.active_fc);
  Object.assign(sources[0], { email: "private@example.test", billing_address: "private", fraud_signals: ["private"] });
  Object.assign(sources[0].cash[0], { provider_payment_id: "private", individual_orders: ["private"], oauth_token: "private" });
  const snapshot = buildGlobalSnapshot({
    creators: sources, period: "all_time", asOf: input.as_of, projectionRevision: input.projection_revision,
  });
  const board = publicGlobalBoard(snapshot);
  assert.equal(board.rows.length, 1);
  const publicRow = board.rows[0] as unknown as Record<string, unknown>;
  for (const [field, value] of Object.entries(expected.public_fields)) assert.equal(publicRow[field], value, field);
  assert.deepEqual(Object.keys(publicRow).sort(), [...Object.keys(expected.public_fields), "rank"].sort());
  for (const field of expected.excluded_public_fields) assert.equal(field in publicRow, false, field);
  assert.equal(board.scope, "global");
  assert.equal(board.period, "all_time");
  assert.equal(board.ranking_disclosure, "paid_ranking");
  assert.doesNotThrow(() => JSON.stringify(board));
  assert.equal(JSON.stringify(board).includes("private"), false);
}));

test("golden subset: three social accounts still produce only one Global row", async () => pilot(async (db) => {
  const { input, expected } = fixture<{
    creator_id: string; first_verification_at: string; verified_accounts: { id: string; platform: string }[];
  }, { global_rows_for_creator: number; combined_score_micro: number; total_fc: number }>(
    "creator-three-accounts-shared-score",
  );
  await addCreator(db, input.creator_id);
  for (const [index, account] of input.verified_accounts.entries()) {
    await verify(db, input.creator_id, account.id, account.platform.toLowerCase(), account.id,
      new Date(Date.parse(input.first_verification_at) + index * 1000).toISOString());
  }
  const snapshot = buildGlobalSnapshot({
    creators: await ledgerSources(db), period: "all_time", asOf: "2026-10-02T00:00:00Z", projectionRevision: 1,
  });
  assert.equal(snapshot.rows.length, expected.global_rows_for_creator);
  assert.equal(snapshot.rows[0].combinedScoreMicro, BigInt(expected.combined_score_micro));
  assert.equal(publicGlobalBoard(snapshot).rows[0].fc, expected.total_fc);
}));

test("revocation or missing publication gate returns only NOT_PUBLIC", async () => pilot(async (db) => {
  await addCreator(db, "creator-hidden");
  await verify(db, "creator-hidden", "ig-hidden", "instagram", "subject-hidden", "2026-09-30T10:00:00Z");
  const request = (creators: CreatorProjectionSource[]) => ({
    creators, period: "all_time" as const, asOf: "2026-10-01T12:00:00Z", projectionRevision: 1,
  });
  const source = (await ledgerSources(db))[0];
  assert.equal(buildGlobalSnapshot(request([source])).rows.length, 1);
  for (const gate of ["consentToPublish", "moderationAllowed", "notDeleted"] as const) {
    const hidden: CreatorProjectionSource = { ...source, eligibility: { ...source.eligibility, [gate]: false } };
    const snapshot = buildGlobalSnapshot(request([hidden]));
    assert.deepEqual(publicCreator(snapshot, source.creatorId), { status: "NOT_PUBLIC" });
    assert.deepEqual(publicGlobalBoard(snapshot).rows, []);
  }
  await db.query("select ranking_pilot.revoke_social($1,$2)", ["creator-hidden", "ig-hidden"]);
  const revoked = buildGlobalSnapshot(request(await ledgerSources(db)));
  assert.deepEqual(publicCreator(revoked, "creator-hidden"), { status: "NOT_PUBLIC" });
  assert.deepEqual(publicCreator(revoked, "unknown"), { status: "NOT_PUBLIC" });
  assert.equal(revoked.rows.length, 0);
}));

test("Daily and Weekly use UTC periods and omit zero-score rows", async () => pilot(async (db) => {
  await addCreator(db, "creator-boundary");
  await verify(db, "creator-boundary", "account-sunday", "instagram", "subject-sunday", "2026-10-04T23:59:00Z");
  await verify(db, "creator-boundary", "account-monday", "youtube", "subject-monday", "2026-10-05T00:00:00Z");
  const creators = await ledgerSources(db);
  const at = "2026-10-05T00:01:00Z";
  const snapshot = (period: "all_time" | "daily" | "weekly", periodStart?: string) => buildGlobalSnapshot({
    creators, period, periodStart, asOf: at, projectionRevision: 2,
  });
  assert.equal(publicGlobalBoard(snapshot("all_time")).rows[0].fc, 2);
  assert.equal(publicGlobalBoard(snapshot("daily", "2026-10-05T00:00:00Z")).rows[0].fc, 1);
  assert.equal(publicGlobalBoard(snapshot("weekly", "2026-10-05T00:00:00Z")).rows[0].fc, 1);
  assert.equal(publicGlobalBoard(snapshot("weekly", "2026-09-28T00:00:00Z")).rows[0].fc, 1);
  assert.deepEqual(publicGlobalBoard(snapshot("daily", "2026-10-03T00:00:00Z")).rows, []);
  assert.throws(() => publicCreator(snapshot("daily", "2026-10-03T00:00:00Z"), "creator-boundary"),
    /All-Time snapshot/);
}, "2026-12-01T00:00:00Z"));

test("quote copies one immutable snapshot's scope, time, version and revision", () => {
  const creators: CreatorProjectionSource[] = [
    { creatorId: "owner", eligibility: allowed, cash: [], fc: [{ grantId: "owner-fc", amountFc: 1, grantedAt: "2026-10-01T10:00:00Z" }] },
    { creatorId: "target", eligibility: allowed, cash: [{ paymentId: "target-cash", grossUsdMinor: 1000,
      effectiveAt: "2026-10-01T11:00:00Z" }], fc: [] },
  ];
  const original = buildGlobalSnapshot({ creators, period: "all_time", asOf: "2026-10-01T12:00:00Z", projectionRevision: 17 });
  const quote = quoteFromSnapshot(original, "owner", "target");
  assert.equal(Object.isFrozen(original), true);
  assert.equal(Object.isFrozen(original.rows), true);
  assert.equal(Object.isFrozen(original.rows[0]), true);
  assert.equal(Object.isFrozen(quote), true);
  assert.equal(quote.scope, original.scope);
  assert.equal(quote.period, original.period);
  assert.equal(quote.rulesVersion, original.rulesVersion);
  assert.equal(quote.asOf, original.asOf);
  assert.equal(quote.projectionRevision, original.projectionRevision);
  assert.equal(quote.bidUsd, BigInt(10));
  assert.equal(quote.resultingScoreMicro > quote.targetScoreMicro, true);
  assert.equal(quote.rankGuaranteed, false);
  const updated = buildGlobalSnapshot({ creators: [...creators.slice(0, 1), { ...creators[1], cash: [
    ...creators[1].cash, { paymentId: "later-cash", grossUsdMinor: 500, effectiveAt: "2026-10-01T12:01:00Z" },
  ] }], period: "all_time", asOf: "2026-10-01T12:02:00Z", projectionRevision: 18 });
  assert.equal(quote.projectionRevision, 17);
  assert.equal(quote.asOf, "2026-10-01T12:00:00Z");
  assert.equal(quote.targetScoreMicro, BigInt(10_000_000));
  assert.equal(quoteFromSnapshot(updated, "owner", "target").targetScoreMicro, BigInt(15_000_000));
});

test("invalid revision, duplicate creator and imprecise JSON score fail closed; exact tie is stable", () => {
  const creator: CreatorProjectionSource = {
    creatorId: "a", eligibility: allowed, cash: [], fc: [{ grantId: "fc-a", amountFc: 1, grantedAt: "2026-10-01T10:00:00Z" }],
  };
  const request = { creators: [creator], period: "all_time" as const, asOf: "2026-10-01T12:00:00Z", projectionRevision: 1 };
  assert.throws(() => buildGlobalSnapshot({ ...request, projectionRevision: 0 }), /positive safe integer/);
  assert.throws(() => buildGlobalSnapshot({ ...request, creators: [creator, creator] }), /Duplicate creator ID/);
  assert.throws(() => buildGlobalSnapshot({ ...request, asOf: "2026-10-01T24:00:00Z" }), /Invalid UTC timestamp/);
  const tied = buildGlobalSnapshot({ ...request,
    creators: [{ ...creator, creatorId: "b" }, creator] });
  assert.deepEqual(tied.rows.map((row) => row.creatorId), ["a", "b"]);
  const huge: CreatorProjectionSource = { ...creator, cash: [{ paymentId: "huge", grossUsdMinor: 1_000_000_000_000,
    effectiveAt: "2026-10-01T10:00:00Z" }], fc: [] };
  const hugeSnapshot = buildGlobalSnapshot({ ...request, creators: [huge] });
  assert.throws(() => publicGlobalBoard(hugeSnapshot), /cannot be represented exactly/);
});

test("JSON score conversion accepts the last whole-USD value within safe integer range", () => {
  const maxWholeUsd = Math.floor(Number.MAX_SAFE_INTEGER / 1_000_000);
  const at = (wholeUsd: number) => buildGlobalSnapshot({
    creators: [{
      creatorId: "boundary", eligibility: allowed,
      cash: [{ paymentId: "boundary-cash", grossUsdMinor: wholeUsd * 100,
        effectiveAt: "2026-10-01T10:00:00Z" }], fc: [],
    }],
    period: "all_time", asOf: "2026-10-01T12:00:00Z", projectionRevision: 1,
  });
  assert.equal(publicGlobalBoard(at(maxWholeUsd)).rows[0].combined_score_micro, maxWholeUsd * 1_000_000);
  assert.throws(() => publicGlobalBoard(at(maxWholeUsd + 1)), /cannot be represented exactly/);
});
