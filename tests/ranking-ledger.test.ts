import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import golden from "../contracts/ranking/v1/golden.json";
import { projectGlobalScore, type Period } from "../lib/core/ranking/v1";

const schema = await readFile("contracts/ranking/v1/pilot-ledger.sql", "utf8");

function fixture<Input, Expected>(id: string): { input: Input; expected: Expected } {
  const value = golden.cases.find((item) => item.id === id);
  assert.ok(value, `Missing golden case: ${id}`);
  return value as unknown as { input: Input; expected: Expected };
}

async function rows<T>(db: PGlite, sql: string, args: unknown[] = []): Promise<T[]> {
  return (await db.query(sql, args)).rows as T[];
}

async function pilot<T>(run: (db: PGlite) => Promise<T>, slotsUsed = 0): Promise<T> {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.query("insert into ranking_pilot.launch_campaign values ('launch',$1,1000,$2)", [
      "2026-10-01T00:00:00Z", slotsUsed,
    ]);
    return await run(db);
  } finally {
    await db.close();
  }
}

async function addCreator(db: PGlite, id: string, registeredAt = "2026-09-20T00:00:00Z") {
  await db.query("insert into ranking_pilot.creators(creator_id,registered_at) values($1,$2)", [id, registeredAt]);
}

async function verify(db: PGlite, creator: string, account: string, provider: string, subject: string, at: string) {
  return (await rows<{ welcome_granted: boolean; campaign_granted: boolean }>(db,
    "select * from ranking_pilot.verify_social($1,$2,$3,$4,$5)",
    [creator, account, provider, subject, at]))[0];
}

async function projection(db: PGlite, creatorId: string, period: Period, asOf: string, periodStart?: string) {
  const cash = await rows<{ source_key: string; gross_usd_minor: string | number; ranking_effective_at: Date }>(db,
    "select source_key,gross_usd_minor,ranking_effective_at from ranking_pilot.cash_payments where creator_id=$1 and status='confirmed'",
    [creatorId]);
  const fc = await rows<{ source_key: string; amount_fc: number; granted_at: Date }>(db,
    "select source_key,amount_fc,granted_at from ranking_pilot.fc_grants where creator_id=$1", [creatorId]);
  return projectGlobalScore({
    creatorId, period, periodStart, asOf,
    cash: cash.map((item) => ({
      paymentId: item.source_key,
      grossUsdMinor: Number(item.gross_usd_minor),
      effectiveAt: item.ranking_effective_at.toISOString(),
    })),
    fc: fc.map((item) => ({
      grantId: item.source_key, amountFc: item.amount_fc, grantedAt: item.granted_at.toISOString(),
    })),
  });
}

test("golden subset: three social accounts share one creator and one Global FC score", async () => pilot(async (db) => {
  const { input, expected } = fixture<{
    creator_id: string; first_verification_at: string;
    verified_accounts: { id: string; platform: string }[];
  }, { welcome_fc: number; campaign_fc: number; total_fc: number; combined_score_micro: number; global_rows_for_creator: number; new_promo_slots_used: number }>(
    "creator-three-accounts-shared-score",
  );
  await addCreator(db, input.creator_id);
  for (const [index, account] of input.verified_accounts.entries()) {
    await verify(db, input.creator_id, account.id, account.platform.toLowerCase(), account.id,
      new Date(Date.parse(input.first_verification_at) + index * 1000).toISOString());
  }
  const grants = await rows<{ grant_kind: string; amount_fc: number }>(db,
    "select grant_kind,amount_fc from ranking_pilot.fc_grants where creator_id=$1", [input.creator_id]);
  assert.equal(grants.filter((grant) => grant.grant_kind === "welcome").length, expected.welcome_fc);
  assert.equal(grants.filter((grant) => grant.grant_kind === "campaign_launch").reduce((sum, grant) => sum + grant.amount_fc, 0), expected.campaign_fc);
  assert.equal(grants.reduce((sum, grant) => sum + grant.amount_fc, 0), expected.total_fc);
  assert.equal((await projection(db, input.creator_id, "all_time", "2026-10-02T00:00:00Z")).combinedScoreMicro,
    BigInt(expected.combined_score_micro));
  assert.equal((await rows(db, "select * from ranking_pilot.verified_creators where creator_id=$1", [input.creator_id])).length,
    expected.global_rows_for_creator);
  const campaign = await rows<{ admitted_count: number }>(db, "select admitted_count from ranking_pilot.launch_campaign");
  assert.equal(campaign[0].admitted_count, expected.new_promo_slots_used);
}));

test("golden: full campaign still issues welcome FC", async () => pilot(async (db) => {
  const { input, expected } = fixture<{
    creator_id: string; newly_verified_social_account_id: string;
  }, { welcome_fc: number; campaign_fc: number; combined_score_micro: number; new_promo_slots_used: number }>(
    "promo-full-welcome-still-ranks",
  );
  await addCreator(db, input.creator_id);
  const result = await verify(db, input.creator_id, input.newly_verified_social_account_id, "youtube", "yt-full", "2026-10-01T12:00:00Z");
  assert.equal(Number(result.welcome_granted), expected.welcome_fc);
  assert.equal(Number(result.campaign_granted) * 5, expected.campaign_fc);
  assert.equal((await projection(db, input.creator_id, "all_time", "2026-10-02T00:00:00Z")).combinedScoreMicro,
    BigInt(expected.combined_score_micro));
  const campaign = await rows<{ admitted_count: number }>(db, "select admitted_count from ranking_pilot.launch_campaign");
  assert.equal(campaign[0].admitted_count - 1000, expected.new_promo_slots_used);
}, 1000));

test("golden: registration before launch and first proof after launch qualifies once", async () => pilot(async (db) => {
  const { input, expected } = fixture<{
    creator_registered_at: string; first_social_verification_at: string; promo_slots_used_before: number;
  }, { welcome_fc: number; campaign_fc: number; new_promo_slots_used: number; combined_score_micro: number }>(
    "registration-before-launch-verification-after-launch",
  );
  await addCreator(db, "creator-launch", input.creator_registered_at);
  const result = await verify(db, "creator-launch", "account-launch", "instagram", "subject-launch", input.first_social_verification_at);
  assert.equal(Number(result.welcome_granted), expected.welcome_fc);
  assert.equal(Number(result.campaign_granted) * 5, expected.campaign_fc);
  assert.equal((await projection(db, "creator-launch", "all_time", "2026-10-02T00:00:00Z")).combinedScoreMicro,
    BigInt(expected.combined_score_micro));
  const campaign = await rows<{ admitted_count: number }>(db, "select admitted_count from ranking_pilot.launch_campaign");
  assert.equal(campaign[0].admitted_count - input.promo_slots_used_before, expected.new_promo_slots_used);
}, 12));

test("golden: reconnect preserves historical grant and revocation hides verified membership", async () => pilot(async (db) => {
  const { input, expected } = fixture<{
    creator_id: string; provider_subject: string;
  }, { new_welcome_grants: number; lifetime_welcome_fc: number; all_time_fc_score_micro: number }>(
    "reconnect-does-not-mint-welcome-fc",
  );
  await addCreator(db, input.creator_id);
  await verify(db, input.creator_id, "ig-existing", "instagram", input.provider_subject, "2026-09-30T10:00:00Z");
  assert.equal(await rows(db, "select * from ranking_pilot.verified_creators where creator_id=$1", [input.creator_id]).then((items) => items.length), 1);
  const revoked = await rows<{ revoke_social: boolean }>(db,
    "select ranking_pilot.revoke_social($1,$2)", [input.creator_id, "ig-existing"]);
  assert.equal(revoked[0].revoke_social, true);
  assert.equal((await rows(db, "select * from ranking_pilot.verified_creators where creator_id=$1", [input.creator_id])).length, 0);
  const replay = await verify(db, input.creator_id, "ig-existing", "instagram", input.provider_subject, "2026-10-02T10:00:00Z");
  assert.equal(Number(replay.welcome_granted), expected.new_welcome_grants);
  const grants = await rows<{ amount_fc: number }>(db,
    "select amount_fc from ranking_pilot.fc_grants where creator_id=$1", [input.creator_id]);
  assert.equal(grants.reduce((sum, grant) => sum + grant.amount_fc, 0), expected.lifetime_welcome_fc);
  assert.equal((await projection(db, input.creator_id, "all_time", "2026-10-03T00:00:00Z")).fcScoreMicro,
    BigInt(expected.all_time_fc_score_micro));
}));

test("golden: welcome cap is ten per main creator", async () => pilot(async (db) => {
  const { input, expected } = fixture<{
    creator_id: string; distinct_eligible_verified_social_accounts: number;
  }, { welcome_fc: number; welcome_score_micro: number; lifetime_welcome_fc_cap: number }>(
    "welcome-cap-ten-per-main-profile",
  );
  await addCreator(db, input.creator_id);
  for (let index = 0; index <= input.distinct_eligible_verified_social_accounts; index++) {
    await verify(db, input.creator_id, `account-${index}`, "instagram", `subject-${index}`,
      new Date(Date.parse("2026-09-30T10:00:00Z") + index * 1000).toISOString());
  }
  const grants = await rows<{ amount_fc: number }>(db,
    "select amount_fc from ranking_pilot.fc_grants where creator_id=$1", [input.creator_id]);
  assert.equal(grants.length, expected.welcome_fc);
  assert.equal(grants.length, expected.lifetime_welcome_fc_cap);
  assert.equal((await projection(db, input.creator_id, "all_time", "2026-10-01T00:00:00Z")).fcScoreMicro,
    BigInt(expected.welcome_score_micro));
}));

test("golden: one social subject cannot be claimed by another creator", async () => pilot(async (db) => {
  const { input, expected } = fixture<{
    provider_subject: string; first_claim_creator_id: string; second_claim_creator_id: string;
  }, { second_active_verified_owner_allowed: boolean; additional_welcome_fc: number }>(
    "same-social-identity-cannot-claim-twice",
  );
  await addCreator(db, input.first_claim_creator_id);
  await addCreator(db, input.second_claim_creator_id);
  await verify(db, input.first_claim_creator_id, "youtube-first", "youtube", input.provider_subject, "2026-09-30T10:00:00Z");
  await assert.rejects(() => verify(db, input.second_claim_creator_id, "youtube-second", "youtube", input.provider_subject,
    "2026-10-01T10:00:00Z"), /already belongs/);
  const owners = await rows<{ creator_id: string }>(db,
    "select creator_id from ranking_pilot.social_accounts where provider='youtube' and subject=$1", [input.provider_subject]);
  assert.equal(owners.length === 2, expected.second_active_verified_owner_allowed);
  assert.deepEqual(owners.map((owner) => owner.creator_id), [input.first_claim_creator_id]);
  assert.equal((await rows(db, "select * from ranking_pilot.fc_grants where creator_id=$1", [input.second_claim_creator_id])).length,
    expected.additional_welcome_fc);
}));

test("golden: late webhook has one cash row and provider-success period", async () => pilot(async (db) => {
  const { input, expected } = fixture<{
    payment_id: string; gross_usd_minor: number; provider_success_at: string; webhook_received_at: string[];
  }, {
    cash_contributions_created: number; cash_score_micro: number;
    daily_cash_score_micro: Record<string, number>; weekly_cash_score_micro_by_start: Record<string, number>;
  }>("late-webhook-uses-provider-success-time-once");
  await addCreator(db, "cash-recipient");
  const source = `dodo:${input.payment_id}`;
  const record = (received: string) => rows<{ record_cash: boolean }>(db,
    "select ranking_pilot.record_cash($1,$2,$3,$4,$5,$6)",
    [source, "cash-recipient", input.gross_usd_minor, input.provider_success_at, received, false]);
  assert.equal((await record(input.webhook_received_at[0]))[0].record_cash, true);
  assert.equal((await record(input.webhook_received_at[1]))[0].record_cash, false);
  assert.equal((await rows(db, "select * from ranking_pilot.cash_payments where source_key=$1", [source])).length,
    expected.cash_contributions_created);
  assert.equal((await projection(db, "cash-recipient", "all_time", input.webhook_received_at[1])).cashScoreMicro,
    BigInt(expected.cash_score_micro));
  for (const [day, score] of Object.entries(expected.daily_cash_score_micro)) {
    assert.equal((await projection(db, "cash-recipient", "daily", input.webhook_received_at[1], `${day}T00:00:00Z`)).cashScoreMicro,
      BigInt(score));
  }
  for (const [start, score] of Object.entries(expected.weekly_cash_score_micro_by_start)) {
    assert.equal((await projection(db, "cash-recipient", "weekly", input.webhook_received_at[1], start)).cashScoreMicro,
      BigInt(score));
  }
}));

test("golden: held payment ranks only on one release and keeps provider success time", async () => pilot(async (db) => {
  const { input, expected } = fixture<{
    creator_id: string; payment_id: string; gross_usd_minor: number;
    provider_success_at: string; restriction_lifted_at: string;
  }, {
    payment_records_created: number; ranking_contributions_created: number;
    cash_score_micro_before_release: number; provider_success_at_preserved: string;
    ranking_effective_at: string; cash_score_micro_after_release: number;
    daily_cash_score_micro: Record<string, number>; weekly_cash_score_micro_by_start: Record<string, number>;
  }>("held-payment-ranks-on-release-only");
  await addCreator(db, input.creator_id);
  const source = `dodo:${input.payment_id}`;
  const first = await rows<{ record_cash: boolean }>(db,
    "select ranking_pilot.record_cash($1,$2,$3,$4,$5,$6)",
    [source, input.creator_id, input.gross_usd_minor, input.provider_success_at, "2026-10-05T00:01:00Z", true]);
  assert.equal(first[0].record_cash, true);
  assert.equal((await rows(db, "select * from ranking_pilot.cash_payments where source_key=$1", [source])).length,
    expected.payment_records_created);
  assert.equal((await projection(db, input.creator_id, "all_time", "2026-10-05T10:00:00Z")).cashScoreMicro,
    BigInt(expected.cash_score_micro_before_release));
  const release = () => rows<{ release_held_cash: boolean }>(db,
    "select ranking_pilot.release_held_cash($1,$2)", [source, input.restriction_lifted_at]);
  assert.equal((await release())[0].release_held_cash, true);
  assert.equal((await release())[0].release_held_cash, false);
  await assert.rejects(() => rows(db, "select ranking_pilot.release_held_cash($1,$2)",
    [source, "2026-10-05T12:00:01Z"]), /Conflicting release replay/);
  const payments = await rows<{ provider_success_at: Date; ranking_effective_at: Date }>(db,
    "select provider_success_at,ranking_effective_at from ranking_pilot.cash_payments where source_key=$1", [source]);
  assert.equal(payments.length, expected.ranking_contributions_created);
  assert.equal(payments[0].provider_success_at.toISOString(), new Date(expected.provider_success_at_preserved).toISOString());
  assert.equal(payments[0].ranking_effective_at.toISOString(), new Date(expected.ranking_effective_at).toISOString());
  assert.equal((await projection(db, input.creator_id, "all_time", "2026-10-06T00:00:00Z")).cashScoreMicro,
    BigInt(expected.cash_score_micro_after_release));
  for (const [day, score] of Object.entries(expected.daily_cash_score_micro)) {
    assert.equal((await projection(db, input.creator_id, "daily", "2026-10-06T00:00:00Z", `${day}T00:00:00Z`)).cashScoreMicro,
      BigInt(score));
  }
  for (const [start, score] of Object.entries(expected.weekly_cash_score_micro_by_start)) {
    assert.equal((await projection(db, input.creator_id, "weekly", "2026-10-06T00:00:00Z", start)).cashScoreMicro,
      BigInt(score));
  }
}));

test("conflicting and invalid cash events roll back without a second row", async () => pilot(async (db) => {
  await addCreator(db, "creator-a");
  await addCreator(db, "creator-b");
  const record = (creator: string, amount: number, timestamp: string) => rows(db,
    "select ranking_pilot.record_cash($1,$2,$3,$4,$5,$6)",
    ["dodo:stable", creator, amount, timestamp, "2026-10-05T00:01:00Z", false]);
  await assert.rejects(() => record("creator-a", 400, "2026-10-04T23:59:00Z"), /Invalid confirmed cash input/);
  await assert.rejects(() => record("creator-a", 501, "2026-10-04T23:59:00Z"), /Invalid confirmed cash input/);
  await assert.rejects(() => record("creator-a", 500, "2026-10-04T23:59:00.123456Z"), /canonical UTC/);
  await assert.rejects(() => record("creator-a", 500, "2026-10-01T24:00:00Z"), /Non-canonical UTC/);
  await assert.rejects(() => record("creator-a", 500, "2026-10-01T23:59:60Z"), /Non-canonical UTC/);
  assert.equal((await rows(db, "select * from ranking_pilot.cash_payments")).length, 0);
  await record("creator-a", 500, "2026-10-04T23:59:00Z");
  await assert.rejects(() => record("creator-b", 500, "2026-10-04T23:59:00Z"), /Conflicting replay/);
  await assert.rejects(() => record("creator-a", 600, "2026-10-04T23:59:00Z"), /Conflicting replay/);
  await assert.rejects(() => record("creator-a", 500, "2026-10-04T23:59:01Z"), /Conflicting replay/);
  await assert.rejects(() => rows(db, "select ranking_pilot.record_cash($1,$2,$3,$4,$5,$6)",
    ["dodo:stable", "creator-a", 500, "2026-10-04T23:59:00Z", "2026-10-05T00:01:00Z", true]),
  /Conflicting replay/);
  const stored = await rows<{ creator_id: string; gross_usd_minor: string | number; provider_success_at: Date; held_initially: boolean }>(db,
    "select creator_id,gross_usd_minor,provider_success_at,held_initially from ranking_pilot.cash_payments");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].creator_id, "creator-a");
  assert.equal(Number(stored[0].gross_usd_minor), 500);
  assert.equal(stored[0].provider_success_at.toISOString(), "2026-10-04T23:59:00.000Z");
  assert.equal(stored[0].held_initially, false);
}));

test("out-of-order proof and client roles cannot mint grants or read pilot ledger", async () => pilot(async (db) => {
  await addCreator(db, "creator-proof");
  await verify(db, "creator-proof", "account-later", "youtube", "later", "2026-10-02T10:00:00Z");
  await assert.rejects(() => verify(db, "creator-proof", "account-earlier", "instagram", "earlier",
    "2026-09-30T10:00:00Z"), /Out-of-order/);
  assert.equal((await rows(db, "select * from ranking_pilot.social_accounts")).length, 1);
  await db.exec("create role anon; create role authenticated;");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(() => db.query("select * from ranking_pilot.fc_grants"), /permission denied/);
      await assert.rejects(() => db.query("select * from ranking_pilot.verify_social('creator-proof','client','x','client','2026-10-03T00:00:00Z')"), /permission denied/);
    } finally {
      await db.exec("reset role");
    }
  }
  assert.equal((await rows(db, "select * from ranking_pilot.fc_grants")).length, 2);
}));

test("prelaunch first proof cannot gain a campaign grant from a later account", async () => pilot(async (db) => {
  await addCreator(db, "creator-prelaunch");
  const first = await verify(db, "creator-prelaunch", "prelaunch-account", "instagram", "prelaunch-subject",
    "2026-09-30T23:59:59Z");
  const later = await verify(db, "creator-prelaunch", "later-account", "youtube", "later-subject",
    "2026-10-01T00:00:01Z");
  assert.equal(first.campaign_granted, false);
  assert.equal(later.campaign_granted, false);
  assert.equal((await rows(db, "select * from ranking_pilot.fc_grants where grant_kind='campaign_launch'")).length, 0);
  assert.equal((await rows<{ admitted_count: number }>(db, "select admitted_count from ranking_pilot.launch_campaign"))[0].admitted_count, 0);
}));

test("last campaign slot is claimed once and next creator still receives welcome FC", async () => pilot(async (db) => {
  await addCreator(db, "creator-last");
  await addCreator(db, "creator-after");
  const last = await verify(db, "creator-last", "last-account", "instagram", "last-subject", "2026-10-01T10:00:00Z");
  const after = await verify(db, "creator-after", "after-account", "youtube", "after-subject", "2026-10-01T10:00:01Z");
  assert.deepEqual(last, { welcome_granted: true, campaign_granted: true });
  assert.deepEqual(after, { welcome_granted: true, campaign_granted: false });
  assert.equal((await rows<{ admitted_count: number }>(db, "select admitted_count from ranking_pilot.launch_campaign"))[0].admitted_count, 1000);
  assert.equal((await rows(db, "select * from ranking_pilot.fc_grants where grant_kind='campaign_launch'")).length, 1);
}, 999));

test("a failure after provisional inserts rolls back proof, grants and first verification", async () => pilot(async (db) => {
  await addCreator(db, "creator-rollback");
  await db.exec("delete from ranking_pilot.launch_campaign");
  await assert.rejects(() => verify(db, "creator-rollback", "rollback-account", "instagram", "rollback-subject",
    "2026-10-01T10:00:00Z"), /configuration missing/);
  assert.equal((await rows(db, "select * from ranking_pilot.social_accounts")).length, 0);
  assert.equal((await rows(db, "select * from ranking_pilot.fc_grants")).length, 0);
  const creator = await rows<{ first_verified_at: Date | null }>(db,
    "select first_verified_at from ranking_pilot.creators where creator_id='creator-rollback'");
  assert.equal(creator[0].first_verified_at, null);
}));
