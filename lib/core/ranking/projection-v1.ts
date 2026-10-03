// Internal projection pilot. It consumes trusted, already validated domain
// evidence; it does not authorize publication, read a live DB or serve an API.
import {
  RULES_VERSION,
  projectGlobalScore,
  quoteStrictOutbid,
  rankByCombinedScore,
  validateProjectionWindow,
  type ConfirmedCashContribution,
  type FcGrant,
  type Period,
} from "./v1";

export interface PublicationEligibility {
  verifiedAccount: boolean;
  consentToPublish: boolean;
  moderationAllowed: boolean;
  notDeleted: boolean;
}

export interface CreatorProjectionSource {
  creatorId: string;
  eligibility: PublicationEligibility;
  cash: readonly ConfirmedCashContribution[];
  fc: readonly FcGrant[];
}

export interface GlobalSnapshotRequest {
  period: Period;
  periodStart?: string;
  asOf: string;
  projectionRevision: number;
  creators: readonly CreatorProjectionSource[];
}

export interface GlobalSnapshotRow {
  readonly creatorId: string;
  readonly rank: number;
  readonly cashScoreMicro: bigint;
  readonly fcScoreMicro: bigint;
  readonly combinedScoreMicro: bigint;
  readonly attainedAt: string;
}

export interface GlobalSnapshot {
  readonly scope: "global";
  readonly period: Period;
  readonly periodStart: string | null;
  readonly asOf: string;
  readonly rulesVersion: typeof RULES_VERSION;
  readonly projectionRevision: number;
  readonly rows: readonly GlobalSnapshotRow[];
}

function eligible(value: PublicationEligibility): boolean {
  return value.verifiedAccount === true && value.consentToPublish === true &&
    value.moderationAllowed === true && value.notDeleted === true;
}

function requireCreatorId(value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("creatorId must be a non-empty string");
  }
}

export function buildGlobalSnapshot(request: GlobalSnapshotRequest): GlobalSnapshot {
  validateProjectionWindow(request.period, request.asOf, request.periodStart);
  if (!Number.isSafeInteger(request.projectionRevision) || request.projectionRevision < 1) {
    throw new RangeError("projectionRevision must be a positive safe integer");
  }
  const ids = new Set<string>();
  for (const creator of request.creators) {
    requireCreatorId(creator.creatorId);
    if (ids.has(creator.creatorId)) throw new RangeError("Duplicate creator ID");
    ids.add(creator.creatorId);
  }

  const projected = request.creators.flatMap((creator) => {
    if (!eligible(creator.eligibility)) return [];
    const score = projectGlobalScore({
      creatorId: creator.creatorId,
      period: request.period,
      periodStart: request.periodStart,
      asOf: request.asOf,
      cash: creator.cash,
      fc: creator.fc,
    });
    // Empty Daily/Weekly periods have no place to rank. Positive score always
    // has an attained time in this additive, pre-refund pilot.
    return score.combinedScoreMicro > BigInt(0) ? [score] : [];
  });
  const byId = new Map(projected.map((item) => [item.creatorId, item]));
  const orderedIds = rankByCombinedScore(projected.map((item) => ({
    creatorId: item.creatorId,
    cashScoreMicro: item.cashScoreMicro,
    fcScoreMicro: item.fcScoreMicro,
    attainedAt: item.attainedAt,
  })));
  const rows = Object.freeze(orderedIds.map((creatorId, index) => {
    const item = byId.get(creatorId);
    if (!item || item.attainedAt === null) throw new Error("Invalid positive projection");
    return Object.freeze({
      creatorId,
      rank: index + 1,
      cashScoreMicro: item.cashScoreMicro,
      fcScoreMicro: item.fcScoreMicro,
      combinedScoreMicro: item.combinedScoreMicro,
      attainedAt: item.attainedAt,
    });
  }));
  return Object.freeze({
    scope: "global" as const,
    period: request.period,
    periodStart: request.periodStart ?? null,
    asOf: request.asOf,
    rulesVersion: RULES_VERSION,
    projectionRevision: request.projectionRevision,
    rows,
  });
}

function exactJsonInteger(value: bigint, name: string): number {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${name} cannot be represented exactly as a JSON integer`);
  }
  return Number(value);
}

export interface PublicGlobalRow {
  creator_id: string;
  rank: number;
  cash_usd_minor: number;
  fc: number;
  combined_score_micro: number;
  rules_version: typeof RULES_VERSION;
  projection_revision: number;
  as_of: string;
  ranking_disclosure: "paid_ranking";
}

function publicUnits(row: GlobalSnapshotRow) {
  const microPerMinor = BigInt(10_000);
  const microPerFc = BigInt(1_000_000);
  if (row.cashScoreMicro % microPerMinor !== BigInt(0) ||
      row.fcScoreMicro % microPerFc !== BigInt(0)) {
    throw new RangeError("Score components cannot be converted to public units");
  }
  return { cash: row.cashScoreMicro / microPerMinor,
    fc: row.fcScoreMicro / microPerFc, combined: row.combinedScoreMicro };
}

function publicRow(snapshot: GlobalSnapshot, row: GlobalSnapshotRow): PublicGlobalRow {
  const units = publicUnits(row);
  // Deliberate allowlist. Never spread source records or internal rows here.
  return {
    creator_id: row.creatorId,
    rank: row.rank,
    cash_usd_minor: exactJsonInteger(units.cash, "cash_usd_minor"),
    fc: exactJsonInteger(units.fc, "fc"),
    combined_score_micro: exactJsonInteger(units.combined, "combined_score_micro"),
    rules_version: snapshot.rulesVersion,
    projection_revision: snapshot.projectionRevision,
    as_of: snapshot.asOf,
    ranking_disclosure: "paid_ranking",
  };
}

// HTTP uses decimal strings so large score integers retain exact precision.
// This remains an aggregate-only allowlist; event evidence never crosses it.
function publicRowExact(snapshot: GlobalSnapshot, row: GlobalSnapshotRow) {
  const units = publicUnits(row);
  return {
    creator_id: row.creatorId,
    rank: row.rank,
    cash_usd_minor: units.cash.toString(),
    fc: units.fc.toString(),
    combined_score_micro: units.combined.toString(),
    rules_version: snapshot.rulesVersion,
    projection_revision: snapshot.projectionRevision,
    as_of: snapshot.asOf,
    ranking_disclosure: "paid_ranking" as const,
  };
}

export function publicGlobalBoard(snapshot: GlobalSnapshot) {
  return {
    scope: snapshot.scope,
    period: snapshot.period,
    period_start: snapshot.periodStart,
    as_of: snapshot.asOf,
    rules_version: snapshot.rulesVersion,
    projection_revision: snapshot.projectionRevision,
    ranking_disclosure: "paid_ranking" as const,
    rows: snapshot.rows.map((row) => publicRow(snapshot, row)),
  };
}

export function publicGlobalBoardExact(snapshot: GlobalSnapshot) {
  return {
    scope: snapshot.scope,
    period: snapshot.period,
    period_start: snapshot.periodStart,
    as_of: snapshot.asOf,
    rules_version: snapshot.rulesVersion,
    projection_revision: snapshot.projectionRevision,
    ranking_disclosure: "paid_ranking" as const,
    rows: snapshot.rows.map((row) => publicRowExact(snapshot, row)),
  };
}

export function publicCreator(snapshot: GlobalSnapshot, creatorId: string):
  { status: "OK"; row: PublicGlobalRow } | { status: "NOT_PUBLIC" } {
  if (snapshot.period !== "all_time") {
    throw new RangeError("Public creator lookup requires an All-Time snapshot");
  }
  const row = snapshot.rows.find((item) => item.creatorId === creatorId);
  return row ? { status: "OK", row: publicRow(snapshot, row) } : { status: "NOT_PUBLIC" };
}

export function publicCreatorExact(snapshot: GlobalSnapshot, creatorId: string) {
  if (snapshot.period !== "all_time") {
    throw new RangeError("Public creator lookup requires an All-Time snapshot");
  }
  const row = snapshot.rows.find((item) => item.creatorId === creatorId);
  return row ? { status: "OK" as const, row: publicRowExact(snapshot, row) }
    : { status: "NOT_PUBLIC" as const };
}

export function quoteFromSnapshot(snapshot: GlobalSnapshot, ownerId: string, targetId: string) {
  const owner = snapshot.rows.find((row) => row.creatorId === ownerId);
  const target = snapshot.rows.find((row) => row.creatorId === targetId);
  if (!owner || !target || ownerId === targetId) throw new RangeError("Quote requires distinct public creators in one snapshot");
  const quote = quoteStrictOutbid(owner.combinedScoreMicro, target.combinedScoreMicro);
  return Object.freeze({
    scope: snapshot.scope,
    period: snapshot.period,
    periodStart: snapshot.periodStart,
    asOf: snapshot.asOf,
    rulesVersion: snapshot.rulesVersion,
    projectionRevision: snapshot.projectionRevision,
    ownerId,
    targetId,
    ownScoreMicro: owner.combinedScoreMicro,
    targetScoreMicro: target.combinedScoreMicro,
    bidUsd: quote.bidUsd,
    resultingScoreMicro: quote.resultingScoreMicro,
    rankGuaranteed: quote.rankGuaranteed,
  });
}
