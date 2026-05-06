import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import { withTransaction } from "../../config/database.js";
import {
  findActiveSlaHoursByCategory,
  findAreaNameByPincode,
} from "../../repositories/businessRuleRepository.js";
import {
  createDailyCallPlanReport,
  insertDailyCallPlanReportRows,
} from "../../repositories/dailyCallPlanReportRepository.js";
import { findOrCreateCompletedHistorySessionForReport } from "../../repositories/historyRepository.js";
import {
  findComparableReportRowsBySessionId,
  findPreviousCompletedComparisonSession,
  replaceReportComparison,
} from "../../repositories/reportComparisonRepository.js";
import {
  findCallPlanRecordsByBatchId,
  findFlexWipRecordsByBatchId,
  findRenderwaysRecordsByBatchId,
} from "../../repositories/sourceRecordRepository.js";
import type { ComparableReportRow } from "../../types/reportComparison.js";
import type {
  DuplicateTrackingSummary,
  MatchStatus,
} from "../../types/matching.js";
import type {
  GeneratedReportComparisonMetadata,
  GeneratedDailyCallPlanReport,
  GeneratedDailyCallPlanRow,
  GenerateDailyCallPlanInput,
} from "../../types/reportGeneration.js";
import { unprocessableEntity } from "../../utils/httpError.js";
import { matchSourceRecords } from "../compareService/matchingEngine.js";
import {
  dedupeRowsByTicket,
  findDuplicateTicketKeys,
} from "../normalization/dedupeRowsByTicket.js";
import {
  buildReportComparison,
  comparePersistedReportSessions,
} from "../reportComparison/compareReportsService.js";
import {
  formatDailyCallPlanRow,
  orderedDailyCallPlanRow,
} from "./dailyCallPlanFormatter.js";
import { validateReportGenerationTransaction } from "./reportGenerationValidation.js";

function countDuplicateTickets(rows: readonly GeneratedDailyCallPlanRow[]): number {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const ticketId = String(row.output["Ticket ID"] ?? "").trim();

    if (!ticketId) {
      continue;
    }

    counts.set(ticketId, (counts.get(ticketId) ?? 0) + 1);
  }

  return Array.from(counts.values()).filter((count) => count > 1).length;
}

function countUnmatchedRows(
  rows: readonly GeneratedDailyCallPlanRow[],
): number {
  const unmatchedStatuses: ReadonlySet<MatchStatus> = new Set([
    "RENDERWAYS_MISSING",
    "FLEX_MISSING",
    "CALLPLAN_MISSING",
    "BOTH_MISSING",
  ]);

  return rows.filter((row) =>
    unmatchedStatuses.has(row.enriched.match_status),
  ).length;
}

function toComparableReportRow(
  row: GeneratedDailyCallPlanRow,
): ComparableReportRow {
  return {
    rowNumber: row.serialNo,
    ticketId: row.enriched.ticket_id,
    flexStatus: row.enriched.flex_status,
    rtplStatus: row.enriched.rtpl_status,
    wipAging: row.enriched.wip_aging,
    wipAgingCategory: row.enriched.wip_aging_category,
    tat: row.enriched.tat,
    engineer: row.enriched.engineer,
    location: row.enriched.location,
  };
}

function skippedComparisonMetadata(
  currentSessionId: string,
): GeneratedReportComparisonMetadata {
  return {
    skipped: true,
    reason: "NO_PREVIOUS_REPORT",
    currentSessionId,
    previousSessionId: null,
    summary: null,
    duplicateTicketIds: {
      current: [],
      previous: [],
    },
  };
}

function applyComparisonToGeneratedRows(
  rows: GeneratedDailyCallPlanRow[],
  comparison: ReturnType<typeof buildReportComparison>,
): void {
  const insightByRowNumber = new Map(
    comparison.rowDiffs
      .filter((diff) => diff.currentRow)
      .map((diff) => [diff.currentRow!.rowNumber, diff.insight]),
  );

  for (const row of rows) {
    row.comparison = insightByRowNumber.get(row.serialNo) ?? null;
  }
}

function metadataFromComparison(
  comparison: ReturnType<typeof buildReportComparison>,
): GeneratedReportComparisonMetadata {
  return {
    skipped: false,
    reason: null,
    currentSessionId: comparison.currentSessionId,
    previousSessionId: comparison.previousSessionId,
    summary: comparison.summary,
    duplicateTicketIds: comparison.duplicateTicketIds,
  };
}

function assertNoResidualDuplicates(
  label: string,
  rows: Parameters<typeof dedupeRowsByTicket>[0],
): void {
  const duplicateTicketKeys = findDuplicateTicketKeys(rows);

  if (duplicateTicketKeys.length > 0) {
    throw unprocessableEntity(`Duplicate ticket IDs remain after ${label} dedupe`, {
      duplicateTicketKeys,
    });
  }
}

export async function generateDailyCallPlanReport(
  input: GenerateDailyCallPlanInput,
): Promise<GeneratedDailyCallPlanReport> {
  return withTransaction(async (client) => {
    const existingReportId = await validateReportGenerationTransaction(client, input);

    const flexWip = await findFlexWipRecordsByBatchId(
      client,
      input.flexUploadBatchId,
    );
    const renderways = input.renderwaysUploadBatchId
      ? await findRenderwaysRecordsByBatchId(
          client,
          input.renderwaysUploadBatchId,
        )
      : [];
    const callPlan = input.callPlanUploadBatchId
      ? await findCallPlanRecordsByBatchId(
          client,
          input.callPlanUploadBatchId,
        )
      : [];

    if (flexWip.length === 0) {
      throw unprocessableEntity("Flex WIP batch has no persisted rows", {
        flexRows: flexWip.length,
      });
    }

    const dedupedFlexWip = dedupeRowsByTicket(flexWip);
    const dedupedRenderways = dedupeRowsByTicket(renderways);
    const dedupedCallPlan = dedupeRowsByTicket(callPlan);

    assertNoResidualDuplicates("Flex WIP", dedupedFlexWip.dedupedRows);
    assertNoResidualDuplicates("Renderways", dedupedRenderways.dedupedRows);
    assertNoResidualDuplicates("Call Plan", dedupedCallPlan.dedupedRows);

    const duplicateTracking: DuplicateTrackingSummary = {
      flexWip: dedupedFlexWip.duplicateCount,
      renderways: dedupedRenderways.duplicateCount,
      callPlan: dedupedCallPlan.duplicateCount,
      total:
        dedupedFlexWip.duplicateCount +
        dedupedRenderways.duplicateCount +
        dedupedCallPlan.duplicateCount,
    };

    if (duplicateTracking.total > 0) {
      console.info("[dailyCallPlanGenerator] Removed duplicate rows before matching", duplicateTracking);
    }

    const slaHoursByWipAgingCategory = await findActiveSlaHoursByCategory(client);
    const areaNameByPincode = await findAreaNameByPincode(
      client,
      input.regionId,
    );
    const matches = matchSourceRecords({
      flexWip: dedupedFlexWip.dedupedRows,
      renderways: dedupedRenderways.dedupedRows,
      callPlan: dedupedCallPlan.dedupedRows,
      slaHoursByWipAgingCategory,
      areaNameByPincode,
    });
    const matchedMatches = matches.filter((match) => match.flexWip !== null);
    
    matchedMatches.sort((a, b) => {
      const aAging = parseInt(a.enrichedRow.wip_aging ?? "0", 10);
      const bAging = parseInt(b.enrichedRow.wip_aging ?? "0", 10);
      const valA = Number.isNaN(aAging) ? 0 : aAging;
      const valB = Number.isNaN(bAging) ? 0 : bAging;
      return valB - valA;
    });

    const rows = matchedMatches.map<GeneratedDailyCallPlanRow>((match, index) => {
      const serialNo = index + 1;

      return {
        serialNo,
        enriched: match.enrichedRow,
        match,
        comparison: null,
        output: orderedDailyCallPlanRow(
          formatDailyCallPlanRow(serialNo, match.enrichedRow),
        ),
      };
    });
    const duplicateTicketCount = countDuplicateTickets(rows);
    const unmatchedTicketCount = countUnmatchedRows(rows);
    
    let reportId = existingReportId;
    if (!reportId) {
      reportId = await createDailyCallPlanReport(client, input, {
        totalRows: rows.length,
        duplicateTicketCount,
        unmatchedTicketCount,
      });
    }

    const historySession = await findOrCreateCompletedHistorySessionForReport(
      client,
      {
        userId: input.generatedBy,
        title: `Report Session ${input.reportDate}`,
        regionId: input.regionId,
        flexUploadBatchId: input.flexUploadBatchId,
        renderwaysUploadBatchId: input.renderwaysUploadBatchId ?? null,
        callPlanUploadBatchId: input.callPlanUploadBatchId ?? null,
        dailyCallPlanReportId: reportId,
        totalRows: rows.length,
      },
    );
    let comparison: GeneratedReportComparisonMetadata;

    if (existingReportId) {
      const persistedComparison = await comparePersistedReportSessions(client, {
        currentSessionId: historySession.id,
      });

      if (persistedComparison.skipped) {
        comparison = skippedComparisonMetadata(historySession.id);
      } else {
        applyComparisonToGeneratedRows(rows, persistedComparison);
        comparison = metadataFromComparison(persistedComparison);
      }
    } else {
      const previousSession = await findPreviousCompletedComparisonSession(
        client,
        historySession.id,
      );

      if (!previousSession) {
        comparison = skippedComparisonMetadata(historySession.id);
      } else {
        const previousRows = await findComparableReportRowsBySessionId(
          client,
          previousSession.id,
        );
        const reportComparison = buildReportComparison({
          currentSessionId: historySession.id,
          previousSessionId: previousSession.id,
          currentRows: rows.map(toComparableReportRow),
          previousRows,
        });

        applyComparisonToGeneratedRows(rows, reportComparison);
        await replaceReportComparison(client, {
          currentSessionId: reportComparison.currentSessionId,
          previousSessionId: reportComparison.previousSessionId,
          summary: reportComparison.summary,
          rowDiffs: reportComparison.rowDiffs.map((diff) => ({
            ticketId: diff.ticketId,
            changeType: diff.changeType,
            changedFields: diff.changedFields,
          })),
        });
        comparison = metadataFromComparison(reportComparison);
      }

      await insertDailyCallPlanReportRows(client, reportId, rows);
    }

    return {
      reportId: reportId as string,
      sessionId: historySession.id,
      reportDate: input.reportDate,
      columns: DAILY_CALL_PLAN_COLUMNS,
      totalRows: rows.length,
      duplicateTicketCount,
      unmatchedTicketCount,
      duplicateTracking,
      comparison,
      rows,
    };
  });
}
