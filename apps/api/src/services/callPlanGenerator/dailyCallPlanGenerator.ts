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
import {
  findCallPlanRecordsByBatchId,
  findFlexWipRecordsByBatchId,
  findRenderwaysRecordsByBatchId,
} from "../../repositories/sourceRecordRepository.js";
import type { MatchStatus } from "../../types/matching.js";
import type {
  GeneratedDailyCallPlanReport,
  GeneratedDailyCallPlanRow,
  GenerateDailyCallPlanInput,
} from "../../types/reportGeneration.js";
import { unprocessableEntity } from "../../utils/httpError.js";
import { matchSourceRecords } from "../compareService/matchingEngine.js";
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

    const slaHoursByWipAgingCategory = await findActiveSlaHoursByCategory(client);
    const areaNameByPincode = await findAreaNameByPincode(
      client,
      input.regionId,
    );
    const matches = matchSourceRecords({
      flexWip,
      renderways,
      callPlan,
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

      await insertDailyCallPlanReportRows(client, reportId, rows);
    }

    return {
      reportId: reportId as string,
      reportDate: input.reportDate,
      columns: DAILY_CALL_PLAN_COLUMNS,
      totalRows: rows.length,
      duplicateTicketCount,
      unmatchedTicketCount,
      rows,
    };
  });
}
