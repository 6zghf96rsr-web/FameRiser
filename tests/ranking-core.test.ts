import assert from "node:assert/strict";
import { test } from "node:test";
import golden from "../contracts/ranking/v1/golden.json";
import {
  fcToScoreMicro,
  grossUsdMinorToScoreMicro,
  projectGlobalScore,
  quoteStrictOutbid,
  rankByCombinedScore,
  summarizeConfirmedPayments,
  validWholeUsdBidMinor,
  type ConfirmedCashContribution,
  type FcGrant,
  type Period,
} from "../lib/core/ranking/v1";

function fixture<Input, Expected>(id: string): { input: Input; expected: Expected } {
  const result = golden.cases.find((item) => item.id === id);
  assert.ok(result, `Missing golden case: ${id}`);
  return result as unknown as { input: Input; expected: Expected };
}

test("golden: gross USD score ignores tax and provider fee", () => {
  const { input, expected } = fixture<{
    confirmed_payments: { payment_id: string; gross_usd_minor: number; tax_usd_minor: number; provider_fee_usd_minor: number }[];
  }, {
    score_micro_by_payment: Record<string, number>;
    combined_cash_score_micro: number;
    recorded_gross_usd_minor: number;
    recorded_tax_usd_minor: number;
    recorded_provider_fee_usd_minor: number;
  }>("gross-usd-score-ignores-tax-and-provider-fee");
  const result = summarizeConfirmedPayments(input.confirmed_payments.map((payment) => ({
    paymentId: payment.payment_id,
    grossUsdMinor: payment.gross_usd_minor,
    taxUsdMinor: payment.tax_usd_minor,
    providerFeeUsdMinor: payment.provider_fee_usd_minor,
  })));
  assert.deepEqual(Object.fromEntries(Object.entries(result.scoreByPayment).map(([id, score]) => [id, Number(score)])), expected.score_micro_by_payment);
  assert.equal(result.cashScoreMicro, BigInt(expected.combined_cash_score_micro));
  assert.equal(result.grossUsdMinor, BigInt(expected.recorded_gross_usd_minor));
  assert.equal(result.taxUsdMinor, BigInt(expected.recorded_tax_usd_minor));
  assert.equal(result.providerFeeUsdMinor, BigInt(expected.recorded_provider_fee_usd_minor));
});

test("golden: a bid is whole USD and at least five dollars", () => {
  const { input, expected } = fixture<{
    candidate_gross_usd_minor: number[];
  }, {
    accepted_gross_usd_minor: number[];
    rejected_gross_usd_minor: number[];
    score_micro_for_500: number;
  }>("usd-bid-minimum-and-whole-dollar");
  assert.deepEqual(input.candidate_gross_usd_minor.filter(validWholeUsdBidMinor), expected.accepted_gross_usd_minor);
  assert.deepEqual(input.candidate_gross_usd_minor.filter((amount) => !validWholeUsdBidMinor(amount)), expected.rejected_gross_usd_minor);
  assert.equal(grossUsdMinorToScoreMicro(500), BigInt(expected.score_micro_for_500));
});

test("golden: Beat Next and Take #1 quote a strict whole-dollar outbid", () => {
  const { input, expected } = fixture<{
    quotes: { mode: string; own_score_micro: number; target_score_micro: number }[];
  }, {
    gross_bid_usd_by_mode: Record<string, number>;
    resulting_score_micro_by_mode: Record<string, number>;
    rank_guaranteed: boolean;
  }>("beat-next-and-take-first-exceed-target");
  for (const quote of input.quotes) {
    const result = quoteStrictOutbid(BigInt(quote.own_score_micro), BigInt(quote.target_score_micro));
    assert.equal(result.bidUsd, BigInt(expected.gross_bid_usd_by_mode[quote.mode]));
    assert.equal(result.resultingScoreMicro, BigInt(expected.resulting_score_micro_by_mode[quote.mode]));
    assert.equal(result.rankGuaranteed, expected.rank_guaranteed);
    assert.ok(result.resultingScoreMicro > BigInt(quote.target_score_micro));
  }
});

test("golden: equal combined score uses attained time, not registration or cash share", () => {
  const { input, expected } = fixture<{
    creators: { id: string; registered_at: string; cash_score_micro: number; fc_score_micro: number; attained_at: string }[];
  }, {
    combined_score_micro_each: number;
    ranked_creator_ids: string[];
    registration_time_used_for_tie: boolean;
    cash_share_used_for_tie: boolean;
  }>("equal-combined-score-uses-attained-time");
  const candidates = input.creators.map((creator) => ({
    creatorId: creator.id,
    cashScoreMicro: BigInt(creator.cash_score_micro),
    fcScoreMicro: BigInt(creator.fc_score_micro),
    attainedAt: creator.attained_at,
  }));
  assert.ok(candidates.every((creator) => creator.cashScoreMicro + creator.fcScoreMicro === BigInt(expected.combined_score_micro_each)));
  assert.deepEqual(rankByCombinedScore(candidates), expected.ranked_creator_ids);
  assert.equal(expected.registration_time_used_for_tie, false);
  assert.equal(expected.cash_share_used_for_tie, false);
});

test("projection derives attained time before ranking and respects asOf", () => {
  const at = (creatorId: string, asOf: string) => projectGlobalScore({
    creatorId,
    period: "all_time",
    asOf,
    cash: creatorId === "cash-later"
      ? [{ paymentId: "cash-1", grossUsdMinor: 500, effectiveAt: "2026-10-01T11:00:00Z" }]
      : [],
    fc: creatorId === "fc-earlier"
      ? [{ grantId: "fc-1", amountFc: 5, grantedAt: "2026-10-01T10:00:00Z" }]
      : [],
  });
  const early = at("fc-earlier", "2026-10-01T10:30:00Z");
  const pending = at("cash-later", "2026-10-01T10:30:00Z");
  assert.equal(early.attainedAt, "2026-10-01T10:00:00Z");
  assert.equal(pending.combinedScoreMicro, BigInt(0));
  assert.equal(pending.attainedAt, null);

  const later = at("cash-later", "2026-10-01T11:30:00Z");
  assert.equal(later.combinedScoreMicro, early.combinedScoreMicro);
  assert.equal(later.attainedAt, "2026-10-01T11:00:00Z");
  assert.deepEqual(rankByCombinedScore([later, early]), ["fc-earlier", "cash-later"]);
});

test("golden: FC grant enters only its UTC day/week and persists in All-Time", () => {
  const { input, expected } = fixture<{
    grants: { id: string; amount_fc: number; granted_at: string }[];
  }, {
    daily_fc: Record<string, number>;
    weekly_fc_by_start: Record<string, number>;
    all_time_fc: number;
  }>("welcome-fc-utc-day-and-week-boundary");
  const fc: FcGrant[] = input.grants.map((grant) => ({ grantId: grant.id, amountFc: grant.amount_fc, grantedAt: grant.granted_at }));
  const projected = (period: Period, periodStart?: string) => projectGlobalScore({
    creatorId: "fixture-creator", period, periodStart, asOf: "2026-10-06T00:00:00Z", cash: [], fc,
  });
  for (const [day, amount] of Object.entries(expected.daily_fc)) {
    assert.equal(projected("daily", `${day}T00:00:00Z`).fcScoreMicro, fcToScoreMicro(amount));
  }
  for (const [start, amount] of Object.entries(expected.weekly_fc_by_start)) {
    assert.equal(projected("weekly", start).fcScoreMicro, fcToScoreMicro(amount));
  }
  assert.equal(projected("all_time").fcScoreMicro, fcToScoreMicro(expected.all_time_fc));
});

test("golden: a late webhook contributes to the provider success day and week", () => {
  const { input, expected } = fixture<{
    payment_id: string; gross_usd_minor: number; provider_success_at: string; webhook_received_at: string[];
  }, {
    cash_score_micro: number;
    daily_cash_score_micro: Record<string, number>;
    weekly_cash_score_micro_by_start: Record<string, number>;
  }>("late-webhook-uses-provider-success-time-once");
  const cash: ConfirmedCashContribution[] = [{
    paymentId: input.payment_id, grossUsdMinor: input.gross_usd_minor, effectiveAt: input.provider_success_at,
  }];
  const projected = (period: Period, periodStart?: string) => projectGlobalScore({
    creatorId: "fixture-creator", period, periodStart, asOf: input.webhook_received_at.at(-1)!, cash, fc: [],
  });
  assert.equal(projected("all_time").cashScoreMicro, BigInt(expected.cash_score_micro));
  for (const [day, score] of Object.entries(expected.daily_cash_score_micro)) {
    assert.equal(projected("daily", `${day}T00:00:00Z`).cashScoreMicro, BigInt(score));
  }
  for (const [start, score] of Object.entries(expected.weekly_cash_score_micro_by_start)) {
    assert.equal(projected("weekly", start).cashScoreMicro, BigInt(score));
  }
});

test("invalid inputs fail closed and exact ties use stable public ID order", () => {
  assert.equal(validWholeUsdBidMinor(400), false);
  assert.equal(validWholeUsdBidMinor(501), false);
  assert.equal(validWholeUsdBidMinor(Number.NaN), false);
  assert.throws(() => grossUsdMinorToScoreMicro(-1), /non-negative/);
  assert.throws(() => fcToScoreMicro(0.5), /non-negative/);
  assert.throws(() => quoteStrictOutbid(BigInt(-1), BigInt(0)), /non-negative/);
  const base = {
    creatorId: "creator", period: "all_time" as const, asOf: "2026-10-05T00:00:00Z", fc: [],
    cash: [{ paymentId: "p", grossUsdMinor: 500, effectiveAt: "2026-10-04T23:59:00Z" }],
  };
  assert.throws(() => projectGlobalScore({ ...base, cash: [...base.cash, ...base.cash] }), /Duplicate payment ID/);
  assert.throws(() => projectGlobalScore({ ...base, cash: [{ ...base.cash[0], effectiveAt: "2026-02-30T00:00:00Z" }] }), /Invalid UTC timestamp/);
  assert.throws(() => projectGlobalScore({ ...base, cash: [{ ...base.cash[0], effectiveAt: "2026-10-04T23:59:00.123456Z" }] }), /ISO 8601 UTC timestamp/);
  assert.equal(projectGlobalScore({ ...base, cash: [{ ...base.cash[0], effectiveAt: "2026-10-04T23:59:00.123Z" }] }).attainedAt, "2026-10-04T23:59:00.123Z");
  assert.throws(() => projectGlobalScore({ ...base, period: "weekly", periodStart: "2026-10-04T00:00:00Z" }), /period boundary/);
  const tied = [
    { creatorId: "00000000-0000-4000-8000-00000000000b", cashScoreMicro: BigInt(5_000_000), fcScoreMicro: BigInt(0), attainedAt: "2026-10-01T10:00:00Z" },
    { creatorId: "00000000-0000-4000-8000-00000000000a", cashScoreMicro: BigInt(0), fcScoreMicro: BigInt(5_000_000), attainedAt: "2026-10-01T10:00:00Z" },
  ];
  const expected = [tied[1].creatorId, tied[0].creatorId];
  assert.deepEqual(rankByCombinedScore(tied), expected);
  assert.deepEqual(rankByCombinedScore([...tied].reverse()), expected);
});
