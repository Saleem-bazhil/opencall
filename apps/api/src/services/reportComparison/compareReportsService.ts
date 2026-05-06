import type { PoolClient } from "pg";
import {
  REPORT_COMPARISON_FIELDS,
  type ComparableReportValue,
  type ReportChangedFields,
  type ReportChangeType,
  type ReportComparisonField,
  type ReportComparisonSummary,
  type ReportRowComparisonInsight,
} from "@opencall/shared";
import {
  findComparableReportRowsBySessionId,
  findComparisonSessionById,
  findPreviousCompletedComparisonSession,
  replaceReportComparison,
  updateCurrentReportRowComparisonInsights,
} from "../../repositories/reportComparisonRepository.js";
import type {
  ComparableReportRow,
  IndexedReportRow,
  PersistedReportComparisonResult,
  ReportComparisonResult,
  ReportRowComparisonResult,
} from "../../types/reportComparison.js";
import { badRequest, unprocessableEntity } from "../../utils/httpError.js";
import {
  dedupeRowsByTicket,
  findDuplicateTicketKeys,
} from "../normalization/dedupeRowsByTicket.js";
import { normalizeTicketId } from "../normalization/valueNormalizer.js";

const FIELD_LABELS: Record<ReportComparisonField, string> = {
  flex_status: "Flex Status",
  rtpl_status: "RTPL",
  wip_aging: "WIP aging",
  wip_aging_category: "WIP aging category",
  tat: "TAT",
  engineer: "Engineer",
  location: "Location",
};

function normalizeComparisonTicketId(value: unknown): string {
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

function stableRowRank(row: ComparableReportRow): string {
  return `${String(row.rowNumber).padStart(12, "0")}:${row.rowId ?? ""}`;
}

function shouldReplaceSelectedRow(
  current: ComparableReportRow,
  candidate: ComparableReportRow,
): boolean {
  return stableRowRank(candidate) < stableRowRank(current);
}

function buildReportRowIndex(
  rows: readonly ComparableReportRow[],
): {
  records: Map<string, IndexedReportRow>;
  duplicateTicketIds: string[];
} {
  const records = new Map<string, IndexedReportRow>();
  const duplicateKeys = new Set<string>();

  for (const row of rows) {
    const key = normalizeComparisonTicketId(row.ticketId);

    if (!key) {
      continue;
    }

    const current = records.get(key);
    if (!current) {
      records.set(key, {
        key,
        row,
        duplicateCount: 1,
      });
      continue;
    }

    duplicateKeys.add(key);
    current.duplicateCount += 1;

    if (shouldReplaceSelectedRow(current.row, row)) {
      current.row = row;
    }
  }

  return {
    records,
    duplicateTicketIds: [...duplicateKeys].sort(),
  };
}

function emptyToNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function canonicalComparableValue(
  field: ReportComparisonField,
  value: unknown,
): ComparableReportValue {
  const cleaned = emptyToNull(value);

  if (cleaned === null) {
    return null;
  }

  if (field === "tat") {
    const date = new Date(cleaned);
    return Number.isNaN(date.getTime()) ? cleaned : date.toISOString();
  }

  if (field === "wip_aging") {
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) && cleaned !== "" ? String(numeric) : cleaned;
  }

  return cleaned;
}

function displayComparableValue(
  field: ReportComparisonField,
  value: unknown,
): ComparableReportValue {
  return canonicalComparableValue(field, value);
}

function getFieldValue(
  row: ComparableReportRow,
  field: ReportComparisonField,
): unknown {
  switch (field) {
    case "flex_status":
      return row.flexStatus;
    case "rtpl_status":
      return row.rtplStatus;
    case "wip_aging":
      return row.wipAging;
    case "wip_aging_category":
      return row.wipAgingCategory;
    case "tat":
      return row.tat;
    case "engineer":
      return row.engineer;
    case "location":
      return row.location;
  }
}

function buildChangedFields(
  currentRow: ComparableReportRow,
  previousRow: ComparableReportRow,
): ReportChangedFields {
  const changes: ReportChangedFields = {};

  for (const field of REPORT_COMPARISON_FIELDS) {
    const previousValue = canonicalComparableValue(
      field,
      getFieldValue(previousRow, field),
    );
    const currentValue = canonicalComparableValue(
      field,
      getFieldValue(currentRow, field),
    );

    if (previousValue === currentValue) {
      continue;
    }

    changes[field] = {
      from: displayComparableValue(field, getFieldValue(previousRow, field)),
      to: displayComparableValue(field, getFieldValue(currentRow, field)),
    };
  }

  return changes;
}

function formatValue(value: ComparableReportValue): string {
  return value === null ? "blank" : String(value);
}

function buildChangeSummary(
  changeType: ReportChangeType,
  changedFields: ReportChangedFields,
): string {
  if (changeType === "NEW") {
    return "New ticket";
  }

  if (changeType === "CLOSED") {
    return "Ticket closed";
  }

  if (changeType === "CARRIED") {
    return "No meaningful change";
  }

  const [firstChangedField] = REPORT_COMPARISON_FIELDS.filter(
    (field) => changedFields[field],
  );

  if (!firstChangedField) {
    return "Updated";
  }

  const change = changedFields[firstChangedField];
  if (!change) {
    return "Updated";
  }

  return `${FIELD_LABELS[firstChangedField]} changed from ${formatValue(
    change.from,
  )} -> ${formatValue(change.to)}`;
}

function buildInsight(
  changeType: ReportChangeType,
  currentRow: ComparableReportRow | null,
  previousRow: ComparableReportRow | null,
  changedFields: ReportChangedFields,
): ReportRowComparisonInsight {
  return {
    changeType,
    previousFlexStatus: previousRow?.flexStatus ?? null,
    previousRtplStatus: previousRow?.rtplStatus ?? null,
    previousWipAging: previousRow?.wipAging ?? null,
    changedFields,
    changeSummary: buildChangeSummary(changeType, changedFields),
  };
}

function countChangedFields(changedFields: ReportChangedFields): number {
  return REPORT_COMPARISON_FIELDS.reduce(
    (count, field) => count + (changedFields[field] ? 1 : 0),
    0,
  );
}

function incrementSummary(
  summary: ReportComparisonSummary,
  changeType: ReportChangeType,
): void {
  switch (changeType) {
    case "NEW":
      summary.new_count += 1;
      return;
    case "CLOSED":
      summary.closed_count += 1;
      return;
    case "UPDATED":
      summary.updated_count += 1;
      return;
    case "CARRIED":
      summary.carried_count += 1;
      return;
  }
}

export function buildReportComparison(input: {
  currentSessionId: string;
  previousSessionId: string;
  currentRows: readonly ComparableReportRow[];
  previousRows: readonly ComparableReportRow[];
}): ReportComparisonResult {
  if (input.currentRows.length === 0) {
    throw unprocessableEntity("Current report has no rows to compare");
  }

  if (input.previousRows.length === 0) {
    throw unprocessableEntity("Previous report has no rows to compare");
  }

  const dedupedCurrentRows = dedupeRowsByTicket(input.currentRows);
  const dedupedPreviousRows = dedupeRowsByTicket(input.previousRows);
  const residualCurrentDuplicates = findDuplicateTicketKeys(
    dedupedCurrentRows.dedupedRows,
  );
  const residualPreviousDuplicates = findDuplicateTicketKeys(
    dedupedPreviousRows.dedupedRows,
  );

  if (residualCurrentDuplicates.length > 0 || residualPreviousDuplicates.length > 0) {
    throw unprocessableEntity("Duplicate ticket IDs remain after comparison dedupe", {
      current: residualCurrentDuplicates,
      previous: residualPreviousDuplicates,
    });
  }

  if (dedupedCurrentRows.duplicateCount + dedupedPreviousRows.duplicateCount > 0) {
    console.info("[compareReportsService] Removed duplicate rows before comparison", {
      currentDuplicateCount: dedupedCurrentRows.duplicateCount,
      previousDuplicateCount: dedupedPreviousRows.duplicateCount,
    });
  }

  const currentIndex = buildReportRowIndex(dedupedCurrentRows.dedupedRows);
  const previousIndex = buildReportRowIndex(dedupedPreviousRows.dedupedRows);

  if (currentIndex.records.size === 0) {
    throw unprocessableEntity("Current report has no comparable ticket IDs");
  }

  if (previousIndex.records.size === 0) {
    throw unprocessableEntity("Previous report has no comparable ticket IDs");
  }

  const allTicketKeys = new Set<string>([
    ...currentIndex.records.keys(),
    ...previousIndex.records.keys(),
  ]);
  const orderedTicketKeys = [...allTicketKeys].sort();
  const rowDiffs: ReportRowComparisonResult[] = [];
  const summary: ReportComparisonSummary = {
    total_tickets: orderedTicketKeys.length,
    new_count: 0,
    closed_count: 0,
    updated_count: 0,
    carried_count: 0,
  };

  for (const key of orderedTicketKeys) {
    const current = currentIndex.records.get(key)?.row ?? null;
    const previous = previousIndex.records.get(key)?.row ?? null;
    const changedFields =
      current && previous ? buildChangedFields(current, previous) : {};
    const changeType: ReportChangeType = !previous
      ? "NEW"
      : !current
        ? "CLOSED"
        : countChangedFields(changedFields) > 0
          ? "UPDATED"
          : "CARRIED";
    const ticketId = current?.ticketId ?? previous?.ticketId ?? key;

    incrementSummary(summary, changeType);

    rowDiffs.push({
      ticketId,
      normalizedTicketId: key,
      changeType,
      changedFields,
      currentRow: current,
      previousRow: previous,
      insight: buildInsight(changeType, current, previous, changedFields),
    });
  }

  return {
    currentSessionId: input.currentSessionId,
    previousSessionId: input.previousSessionId,
    summary,
    rowDiffs,
    duplicateTicketIds: {
      current: currentIndex.duplicateTicketIds,
      previous: previousIndex.duplicateTicketIds,
    },
  };
}

export function buildCurrentRowInsightMap(
  comparison: ReportComparisonResult,
): Map<string, ReportRowComparisonInsight> {
  const insights = new Map<string, ReportRowComparisonInsight>();

  for (const diff of comparison.rowDiffs) {
    if (!diff.currentRow?.rowId) {
      continue;
    }

    insights.set(diff.currentRow.rowId, diff.insight);
  }

  return insights;
}

export async function comparePersistedReportSessions(
  client: PoolClient,
  input: {
    currentSessionId: string;
    previousSessionId?: string | null;
  },
): Promise<PersistedReportComparisonResult> {
  const currentSession = await findComparisonSessionById(
    client,
    input.currentSessionId,
  );

  if (!currentSession) {
    throw badRequest("Current report session does not exist or is not persisted");
  }

  const previousSession = input.previousSessionId
    ? await findComparisonSessionById(client, input.previousSessionId)
    : await findPreviousCompletedComparisonSession(client, input.currentSessionId);

  if (!previousSession) {
    return {
      skipped: true,
      reason: "NO_PREVIOUS_REPORT",
      currentSessionId: input.currentSessionId,
    };
  }

  if (currentSession.regionId !== previousSession.regionId) {
    throw badRequest("Cannot compare report sessions from different regions", {
      currentRegionId: currentSession.regionId,
      previousRegionId: previousSession.regionId,
    });
  }

  const [currentRows, previousRows] = await Promise.all([
    findComparableReportRowsBySessionId(client, currentSession.id),
    findComparableReportRowsBySessionId(client, previousSession.id),
  ]);
  const comparison = buildReportComparison({
    currentSessionId: currentSession.id,
    previousSessionId: previousSession.id,
    currentRows,
    previousRows,
  });

  await replaceReportComparison(client, {
    currentSessionId: comparison.currentSessionId,
    previousSessionId: comparison.previousSessionId,
    summary: comparison.summary,
    rowDiffs: comparison.rowDiffs.map((diff) => ({
      ticketId: diff.ticketId,
      changeType: diff.changeType,
      changedFields: diff.changedFields,
    })),
  });
  await updateCurrentReportRowComparisonInsights(
    client,
    comparison.currentSessionId,
    buildCurrentRowInsightMap(comparison),
  );

  return {
    skipped: false,
    ...comparison,
  };
}
