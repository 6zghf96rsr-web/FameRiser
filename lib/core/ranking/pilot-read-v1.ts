// Internal FR-AI-04A adapter for the disposable ranking_pilot schema. Each
// operation reads fresh evidence through one SQL STABLE function invocation.
// This is not an HTTP API, payment checkout or production persistence layer.
import {
  buildGlobalSnapshot,
  publicCreator,
  publicCreatorExact,
  publicGlobalBoard,
  publicGlobalBoardExact,
  quoteFromSnapshot,
  type CreatorProjectionSource,
  type GlobalSnapshot,
} from "./projection-v1";
import { RULES_VERSION, type Period } from "./v1";

export interface PilotReader {
  query(sql: string): Promise<{ rows: unknown[] }>;
}

interface Evidence {
  projectionRevision: number;
  asOf: string;
  creators: CreatorProjectionSource[];
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${name} must be a string`);
  return value;
}

function positiveRevision(value: unknown): number {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new TypeError("Invalid database projection revision");
  }
  const revision = Number(value);
  if (!Number.isSafeInteger(revision)) throw new RangeError("Database projection revision exceeds safe integer range");
  return revision;
}

function safeNonNegative(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function evidenceFromRow(row: unknown): Evidence {
  const raw = record(record(row, "SQL result").evidence, "projection evidence");
  if (raw.freshRead !== true) throw new TypeError("Projection evidence is not from a fresh read");
  if (!Array.isArray(raw.creators)) throw new TypeError("Creators must be an array");
  const creators = raw.creators.map((source, index): CreatorProjectionSource => {
    const creator = record(source, `creator ${index}`);
    const creatorId = requiredString(creator.creatorId, "public creator ID");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(creatorId)) {
      throw new TypeError("Public creator ID must be a database UUID");
    }
    if (!Array.isArray(creator.cash) || !Array.isArray(creator.fc)) {
      throw new TypeError("Evidence events must be arrays");
    }
    return {
      creatorId,
      eligibility: {
        // The SQL function only emits creators who pass all four predicates.
        verifiedAccount: true,
        consentToPublish: true,
        moderationAllowed: true,
        notDeleted: true,
      },
      cash: creator.cash.map((item, eventIndex) => {
        const event = record(item, `cash event ${eventIndex}`);
        return {
          paymentId: requiredString(event.paymentId, "cash event ID"),
          grossUsdMinor: safeNonNegative(event.grossUsdMinor, "grossUsdMinor"),
          effectiveAt: requiredString(event.effectiveAt, "effectiveAt"),
        };
      }),
      fc: creator.fc.map((item, eventIndex) => {
        const event = record(item, `FC event ${eventIndex}`);
        return {
          grantId: requiredString(event.grantId, "FC event ID"),
          amountFc: safeNonNegative(event.amountFc, "amountFc"),
          grantedAt: requiredString(event.grantedAt, "grantedAt"),
        };
      }),
    };
  });
  return {
    projectionRevision: positiveRevision(raw.projectionRevision),
    asOf: requiredString(raw.asOf, "asOf"),
    creators,
  };
}

async function currentEvidence(reader: PilotReader): Promise<Evidence> {
  const result = await reader.query("select ranking_pilot.read_projection_evidence() as evidence");
  if (result.rows.length !== 1) throw new Error("Expected exactly one projection evidence row");
  return evidenceFromRow(result.rows[0]);
}

export interface InternalCursor {
  readonly period: Period;
  readonly periodStart: string | null;
  readonly asOf: string;
  readonly projectionRevision: number;
  readonly rulesVersion: typeof RULES_VERSION;
  readonly nextIndex: number;
}

export interface GlobalPageRequest {
  period: Period;
  periodStart?: string;
  pageSize: number;
  cursor?: InternalCursor;
}

async function readPage<T extends { rows: readonly unknown[] }>(
  reader: PilotReader, request: GlobalPageRequest, format: (snapshot: GlobalSnapshot) => T,
) {
  if (!Number.isSafeInteger(request.pageSize) || request.pageSize < 1 || request.pageSize > 100) {
    throw new RangeError("pageSize must be between 1 and 100");
  }
  const evidence = await currentEvidence(reader);
  const cursor = request.cursor;
  if (cursor) {
    if (cursor.projectionRevision !== evidence.projectionRevision ||
        cursor.rulesVersion !== RULES_VERSION || cursor.period !== request.period ||
        cursor.periodStart !== (request.periodStart ?? null)) {
      return { status: "STALE_CURSOR" as const };
    }
    if (!Number.isSafeInteger(cursor.nextIndex) || cursor.nextIndex < 0 ||
        typeof cursor.asOf !== "string" || Date.parse(cursor.asOf) > Date.parse(evidence.asOf)) {
      throw new RangeError("Invalid internal cursor");
    }
  }
  const snapshot = buildGlobalSnapshot({
    period: request.period,
    periodStart: request.periodStart,
    asOf: cursor?.asOf ?? evidence.asOf,
    projectionRevision: evidence.projectionRevision,
    creators: evidence.creators,
  });
  const board = format(snapshot);
  const start = cursor?.nextIndex ?? 0;
  const rows = board.rows.slice(start, start + request.pageSize);
  const nextIndex = start + rows.length;
  const nextCursor: InternalCursor | null = nextIndex < board.rows.length ? Object.freeze({
    period: snapshot.period,
    periodStart: snapshot.periodStart,
    asOf: snapshot.asOf,
    projectionRevision: snapshot.projectionRevision,
    rulesVersion: snapshot.rulesVersion,
    nextIndex,
  }) : null;
  return {
    status: "OK" as const,
    page: { ...board, rows },
    nextCursor,
  };
}

export async function readGlobalPage(reader: PilotReader, request: GlobalPageRequest) {
  return readPage(reader, request, publicGlobalBoard);
}

export async function readGlobalPageExact(reader: PilotReader, request: GlobalPageRequest) {
  return readPage(reader, request, publicGlobalBoardExact);
}

export async function readPublicCreator(reader: PilotReader, publicId: string) {
  const evidence = await currentEvidence(reader);
  const snapshot = buildGlobalSnapshot({
    period: "all_time", asOf: evidence.asOf,
    projectionRevision: evidence.projectionRevision,
    creators: evidence.creators,
  });
  return publicCreator(snapshot, publicId);
}

export async function readPublicCreatorExact(reader: PilotReader, publicId: string) {
  const evidence = await currentEvidence(reader);
  const snapshot = buildGlobalSnapshot({
    period: "all_time", asOf: evidence.asOf,
    projectionRevision: evidence.projectionRevision,
    creators: evidence.creators,
  });
  return publicCreatorExact(snapshot, publicId);
}

export type InternalQuote = ReturnType<typeof quoteFromSnapshot>;

export async function quoteCurrent(reader: PilotReader, ownerPublicId: string, targetPublicId: string) {
  const evidence = await currentEvidence(reader);
  const snapshot = buildGlobalSnapshot({
    period: "all_time", asOf: evidence.asOf,
    projectionRevision: evidence.projectionRevision,
    creators: evidence.creators,
  });
  return quoteFromSnapshot(snapshot, ownerPublicId, targetPublicId);
}

function currentPeriodStart(period: Period, asOf: string): string | null {
  if (period === "all_time") return null;
  const at = new Date(asOf);
  at.setUTCHours(0, 0, 0, 0);
  if (period === "weekly") at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
  return at.toISOString();
}

// Checkout still needs to perform this comparison inside its own authorized
// transaction before creating an order. This helper only proves read freshness.
export async function revalidateQuote(reader: PilotReader, quote: InternalQuote) {
  const evidence = await currentEvidence(reader);
  if (quote.scope !== "global" || quote.rankGuaranteed !== false ||
      typeof quote.asOf !== "string" || !Number.isFinite(Date.parse(quote.asOf)) ||
      Date.parse(quote.asOf) > Date.parse(evidence.asOf) ||
      quote.projectionRevision !== evidence.projectionRevision ||
      quote.rulesVersion !== RULES_VERSION ||
      quote.periodStart !== currentPeriodStart(quote.period, evidence.asOf)) {
    return { status: "STALE_QUOTE" as const };
  }
  const snapshot = buildGlobalSnapshot({
    period: quote.period,
    periodStart: quote.periodStart ?? undefined,
    asOf: evidence.asOf,
    projectionRevision: evidence.projectionRevision,
    creators: evidence.creators,
  });
  try {
    const current = quoteFromSnapshot(snapshot, quote.ownerId, quote.targetId);
    if (quote.ownScoreMicro !== current.ownScoreMicro ||
        quote.targetScoreMicro !== current.targetScoreMicro ||
        quote.bidUsd !== current.bidUsd ||
        quote.resultingScoreMicro !== current.resultingScoreMicro) {
      return { status: "STALE_QUOTE" as const };
    }
    return { status: "CURRENT" as const };
  } catch (error) {
    if (error instanceof RangeError && /distinct public creators/.test(error.message)) {
      return { status: "STALE_QUOTE" as const };
    }
    throw error;
  }
}
