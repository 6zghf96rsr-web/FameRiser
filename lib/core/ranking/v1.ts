// Internal, pre-integration ranking kernel. Inputs are already trusted domain events.
// No payment verification, profile eligibility, persistence or public DTO lives here.
export const RULES_VERSION = "ADR-0001-draft.1";
const MICRO_PER_USD = BigInt(1_000_000);
const MICRO_PER_USD_MINOR = BigInt(10_000);
const MIN_BID_USD = BigInt(5);

export type Period = "all_time" | "daily" | "weekly";

export interface ConfirmedCashContribution {
  paymentId: string;
  grossUsdMinor: number;
  effectiveAt: string;
}

export interface FcGrant {
  grantId: string;
  amountFc: number;
  grantedAt: string;
}

export interface GlobalProjectionInput {
  creatorId: string;
  period: Period;
  periodStart?: string;
  asOf: string;
  cash: readonly ConfirmedCashContribution[];
  fc: readonly FcGrant[];
}

export interface GlobalProjection {
  creatorId: string;
  scope: "global";
  period: Period;
  periodStart: string | null;
  asOf: string;
  rulesVersion: typeof RULES_VERSION;
  cashScoreMicro: bigint;
  fcScoreMicro: bigint;
  combinedScoreMicro: bigint;
  attainedAt: string | null;
}

function nonNegativeInteger(value: number, name: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return BigInt(value);
}

function requireId(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function utcMilliseconds(value: string): number {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match) throw new RangeError("Expected ISO 8601 UTC timestamp");
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new RangeError("Invalid UTC timestamp");
  const parsed = new Date(milliseconds);
  if (parsed.toISOString().slice(0, 19) !== match[1] ||
      parsed.getUTCMilliseconds() !== Number((match[2] ?? "").padEnd(3, "0") || 0)) {
    throw new RangeError("Invalid UTC timestamp");
  }
  return milliseconds;
}

function periodBounds(period: Period, periodStart?: string): { start: number; end: number } | null {
  if (period === "all_time") {
    if (periodStart !== undefined) throw new RangeError("All-Time has no period start");
    return null;
  }
  if (period !== "daily" && period !== "weekly") throw new RangeError("Unsupported period");
  if (!periodStart) throw new RangeError("A UTC period start is required");
  const start = utcMilliseconds(periodStart);
  const date = new Date(start);
  if (date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0 ||
      date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0 ||
      (period === "weekly" && date.getUTCDay() !== 1)) {
    throw new RangeError("Invalid UTC period boundary");
  }
  return { start, end: start + (period === "daily" ? 1 : 7) * 86_400_000 };
}

export function validateProjectionWindow(period: Period, asOf: string, periodStart?: string): void {
  utcMilliseconds(asOf);
  periodBounds(period, periodStart);
}

export function grossUsdMinorToScoreMicro(grossUsdMinor: number): bigint {
  return nonNegativeInteger(grossUsdMinor, "grossUsdMinor") * MICRO_PER_USD_MINOR;
}

export function fcToScoreMicro(amountFc: number): bigint {
  return nonNegativeInteger(amountFc, "amountFc") * MICRO_PER_USD;
}

export function validWholeUsdBidMinor(grossUsdMinor: number): boolean {
  return Number.isSafeInteger(grossUsdMinor) && grossUsdMinor >= 500 && grossUsdMinor % 100 === 0;
}

export function quoteStrictOutbid(ownScoreMicro: bigint, targetScoreMicro: bigint) {
  if (typeof ownScoreMicro !== "bigint" || typeof targetScoreMicro !== "bigint" ||
      ownScoreMicro < BigInt(0) || targetScoreMicro < BigInt(0)) {
    throw new RangeError("Scores must be non-negative bigint values");
  }
  const difference = targetScoreMicro - ownScoreMicro;
  const requiredUsd = difference < BigInt(0) ? BigInt(1) : difference / MICRO_PER_USD + BigInt(1);
  const bidUsd = requiredUsd > MIN_BID_USD ? requiredUsd : MIN_BID_USD;
  return {
    bidUsd,
    resultingScoreMicro: ownScoreMicro + bidUsd * MICRO_PER_USD,
    rankGuaranteed: false as const,
  };
}

export function summarizeConfirmedPayments(payments: readonly {
  paymentId: string;
  grossUsdMinor: number;
  taxUsdMinor: number;
  providerFeeUsdMinor: number;
}[]) {
  const scoreByPayment: Record<string, bigint> = Object.create(null) as Record<string, bigint>;
  let grossUsdMinor = BigInt(0);
  let taxUsdMinor = BigInt(0);
  let providerFeeUsdMinor = BigInt(0);
  for (const payment of payments) {
    requireId(payment.paymentId, "paymentId");
    if (Object.hasOwn(scoreByPayment, payment.paymentId)) throw new RangeError("Duplicate payment ID");
    const gross = nonNegativeInteger(payment.grossUsdMinor, "grossUsdMinor");
    const tax = nonNegativeInteger(payment.taxUsdMinor, "taxUsdMinor");
    const fee = nonNegativeInteger(payment.providerFeeUsdMinor, "providerFeeUsdMinor");
    if (gross === BigInt(0) || tax > gross) throw new RangeError("Invalid confirmed payment");
    scoreByPayment[payment.paymentId] = gross * MICRO_PER_USD_MINOR;
    grossUsdMinor += gross;
    taxUsdMinor += tax;
    providerFeeUsdMinor += fee;
  }
  return {
    scoreByPayment,
    grossUsdMinor,
    taxUsdMinor,
    providerFeeUsdMinor,
    cashScoreMicro: grossUsdMinor * MICRO_PER_USD_MINOR,
  };
}

export function projectGlobalScore(input: GlobalProjectionInput): GlobalProjection {
  requireId(input.creatorId, "creatorId");
  const asOf = utcMilliseconds(input.asOf);
  const bounds = periodBounds(input.period, input.periodStart);
  let cashScoreMicro = BigInt(0);
  let fcScoreMicro = BigInt(0);
  let attainedAt: string | null = null;
  let attainedMilliseconds = Number.NEGATIVE_INFINITY;
  const seenCash = new Set<string>();
  const seenFc = new Set<string>();
  const inWindow = (eventAt: number) => eventAt <= asOf &&
    (!bounds || (eventAt >= bounds.start && eventAt < bounds.end));
  const advanceAttainedAt = (timestamp: string, milliseconds: number) => {
    if (milliseconds > attainedMilliseconds) {
      attainedMilliseconds = milliseconds;
      attainedAt = timestamp;
    }
  };

  for (const payment of input.cash) {
    requireId(payment.paymentId, "paymentId");
    if (seenCash.has(payment.paymentId)) throw new RangeError("Duplicate payment ID");
    seenCash.add(payment.paymentId);
    const score = grossUsdMinorToScoreMicro(payment.grossUsdMinor);
    if (score === BigInt(0)) throw new RangeError("Confirmed cash contribution must be positive");
    const effectiveAt = utcMilliseconds(payment.effectiveAt);
    if (inWindow(effectiveAt)) {
      cashScoreMicro += score;
      advanceAttainedAt(payment.effectiveAt, effectiveAt);
    }
  }
  for (const grant of input.fc) {
    requireId(grant.grantId, "grantId");
    if (seenFc.has(grant.grantId)) throw new RangeError("Duplicate FC grant ID");
    seenFc.add(grant.grantId);
    const score = fcToScoreMicro(grant.amountFc);
    if (score === BigInt(0)) throw new RangeError("FC grant must be positive");
    const grantedAt = utcMilliseconds(grant.grantedAt);
    if (inWindow(grantedAt)) {
      fcScoreMicro += score;
      advanceAttainedAt(grant.grantedAt, grantedAt);
    }
  }
  return {
    creatorId: input.creatorId,
    scope: "global",
    period: input.period,
    periodStart: input.periodStart ?? null,
    asOf: input.asOf,
    rulesVersion: RULES_VERSION,
    cashScoreMicro,
    fcScoreMicro,
    combinedScoreMicro: cashScoreMicro + fcScoreMicro,
    attainedAt,
  };
}

export interface RankCandidate {
  creatorId: string;
  cashScoreMicro: bigint;
  fcScoreMicro: bigint;
  attainedAt: string | null;
}

export function rankByCombinedScore(candidates: readonly RankCandidate[]): string[] {
  const ids = new Set<string>();
  const checked = candidates.map((candidate) => {
    requireId(candidate.creatorId, "creatorId");
    if (ids.has(candidate.creatorId)) throw new RangeError("Duplicate creator ID");
    ids.add(candidate.creatorId);
    if (typeof candidate.cashScoreMicro !== "bigint" || typeof candidate.fcScoreMicro !== "bigint" ||
        candidate.cashScoreMicro < BigInt(0) || candidate.fcScoreMicro < BigInt(0)) {
      throw new RangeError("Scores must be non-negative bigint values");
    }
    const total = candidate.cashScoreMicro + candidate.fcScoreMicro;
    const attained = candidate.attainedAt === null ? null : utcMilliseconds(candidate.attainedAt);
    if (total > BigInt(0) && attained === null) throw new RangeError("Positive score needs attainedAt");
    return { creatorId: candidate.creatorId, total, attained };
  });
  return checked.sort((a, b) => {
    if (a.total !== b.total) return a.total > b.total ? -1 : 1;
    if (a.attained === null || b.attained === null) {
      if (a.attained !== b.attained) return a.attained === null ? 1 : -1;
    } else if (a.attained !== b.attained) {
      return a.attained < b.attained ? -1 : 1;
    }
    // The production read boundary supplies a lowercase public UUID here.
    // Code-point order is deterministic across runtimes and request order.
    if (a.creatorId === b.creatorId) return 0;
    return a.creatorId < b.creatorId ? -1 : 1;
  }).map((candidate) => candidate.creatorId);
}
