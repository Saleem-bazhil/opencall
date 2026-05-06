import { cleanString, normalizeTicketId } from "./valueNormalizer.js";

const TIMESTAMP_FIELD_CANDIDATES = [
  "partnerAccept",
  "caseCreatedTime",
  "case_created_time",
  "tat",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "timestamp",
] as const;

const COMPLETENESS_METADATA_FIELDS = new Set([
  "id",
  "rowId",
  "rowNumber",
  "ticketId",
  "ticket_id",
  "normalizedTicketId",
  "normalized_ticket_id",
  "rawRow",
  "raw_row",
  "duplicateFlag",
  "duplicate_flag",
]);

export interface TicketDedupeRow {
  ticketId?: string | null;
  ticket_id?: string | null;
  normalizedTicketId?: string | null;
  normalized_ticket_id?: string | null;
  rowNumber: number;
}

export interface DedupeRowsByTicketResult<TRow> {
  dedupedRows: TRow[];
  duplicateCount: number;
}

interface RankedRow<TRow> {
  firstSeenIndex: number;
  nonNullFieldCount: number;
  normalizedTicketKey: string;
  row: TRow;
  timestampMs: number | null;
}

function resolveTicketId(row: TicketDedupeRow): unknown {
  return (
    row.ticketId ??
    row.ticket_id ??
    row.normalizedTicketId ??
    row.normalized_ticket_id ??
    null
  );
}

function normalizeTicketKey(value: unknown): string {
  const normalized = normalizeTicketId(value);

  if (/^\d+$/.test(normalized)) {
    return normalized.replace(/^0+(?=\d)/, "");
  }

  const woNumericMatch = /^WO0*(\d+)$/.exec(normalized);
  if (woNumericMatch?.[1]) {
    return woNumericMatch[1].replace(/^0+(?=\d)/, "");
  }

  return normalized;
}

export function getNormalizedTicketKey(value: unknown): string {
  return normalizeTicketKey(value);
}

function isMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return cleanString(value) !== null;
  }

  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  return true;
}

function countNonNullFields<TRow extends TicketDedupeRow>(row: TRow): number {
  let count = 0;

  for (const [key, value] of Object.entries(row)) {
    if (COMPLETENESS_METADATA_FIELDS.has(key)) {
      continue;
    }

    if (isMeaningfulValue(value)) {
      count += 1;
    }
  }

  return count;
}

function toTimestampMs(value: unknown): number | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }

  const cleaned = cleanString(value);
  if (!cleaned) {
    return null;
  }

  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function extractLatestTimestampMs<TRow extends TicketDedupeRow>(row: TRow): number | null {
  let latestTimestampMs: number | null = null;
  const candidateFields = row as Record<string, unknown>;

  for (const fieldName of TIMESTAMP_FIELD_CANDIDATES) {
    const timestampMs = toTimestampMs(candidateFields[fieldName]);

    if (timestampMs === null) {
      continue;
    }

    if (latestTimestampMs === null || timestampMs > latestTimestampMs) {
      latestTimestampMs = timestampMs;
    }
  }

  return latestTimestampMs;
}

function shouldReplaceSelectedRow<TRow extends TicketDedupeRow>(
  current: RankedRow<TRow>,
  candidate: RankedRow<TRow>,
): boolean {
  if (candidate.nonNullFieldCount !== current.nonNullFieldCount) {
    return candidate.nonNullFieldCount > current.nonNullFieldCount;
  }

  if (candidate.timestampMs !== current.timestampMs) {
    if (candidate.timestampMs === null) {
      return false;
    }

    if (current.timestampMs === null) {
      return true;
    }

    return candidate.timestampMs > current.timestampMs;
  }

  if (candidate.row.rowNumber !== current.row.rowNumber) {
    return candidate.row.rowNumber < current.row.rowNumber;
  }

  return candidate.firstSeenIndex < current.firstSeenIndex;
}

export function dedupeRowsByTicket<TRow extends TicketDedupeRow>(
  rows: readonly TRow[],
): DedupeRowsByTicketResult<TRow> {
  const selectedRows = new Map<string, RankedRow<TRow>>();
  let duplicateCount = 0;

  rows.forEach((row, index) => {
    const normalizedTicketKey = normalizeTicketKey(resolveTicketId(row));

    if (!normalizedTicketKey) {
      return;
    }

    const candidate: RankedRow<TRow> = {
      firstSeenIndex: index,
      nonNullFieldCount: countNonNullFields(row),
      normalizedTicketKey,
      row,
      timestampMs: extractLatestTimestampMs(row),
    };
    const current = selectedRows.get(normalizedTicketKey);

    if (!current) {
      selectedRows.set(normalizedTicketKey, candidate);
      return;
    }

    duplicateCount += 1;

    if (shouldReplaceSelectedRow(current, candidate)) {
      selectedRows.set(normalizedTicketKey, candidate);
    }
  });

  return {
    dedupedRows: [...selectedRows.values()].map((entry) => entry.row),
    duplicateCount,
  };
}

export function findDuplicateTicketKeys<TRow extends TicketDedupeRow>(
  rows: readonly TRow[],
): string[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const normalizedTicketKey = normalizeTicketKey(resolveTicketId(row));

    if (!normalizedTicketKey) {
      continue;
    }

    counts.set(normalizedTicketKey, (counts.get(normalizedTicketKey) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
}
