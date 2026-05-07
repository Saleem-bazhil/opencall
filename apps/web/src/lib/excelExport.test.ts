import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import { describe, expect, it } from "vitest";
import type { GeneratedReportResponse } from "./apiClient";
import {
  buildReportExportMatrix,
  EXPORT_METADATA_COLUMNS,
} from "./excelExport";

function outputRow(
  overrides: Partial<Record<string, string | number>> = {},
): Record<string, string | number> {
  return DAILY_CALL_PLAN_COLUMNS.reduce<Record<string, string | number>>(
    (output, column) => {
      output[column] = overrides[column] ?? "";
      return output;
    },
    {},
  );
}

function reportFixture(): GeneratedReportResponse {
  return {
    reportId: "report-1",
    sessionId: "session-1",
    reportDate: "2026-05-07",
    columns: DAILY_CALL_PLAN_COLUMNS,
    totalRows: 2,
    duplicateTicketCount: 0,
    unmatchedTicketCount: 0,
    duplicateTracking: {
      flexWip: 0,
      renderways: 0,
      callPlan: 0,
      total: 0,
    },
    carryForward: {
      totalFieldsCarried: 2,
      rowsAutoCompleted: 1,
      rowsStillManual: 1,
    },
    comparison: {
      skipped: false,
      reason: null,
      currentSessionId: "session-1",
      previousSessionId: "session-0",
      summary: {
        total_tickets: 2,
        new_count: 1,
        closed_count: 1,
        updated_count: 0,
        carried_count: 0,
      },
      duplicateTicketIds: {
        current: [],
        previous: [],
      },
    },
    regionBreakdown: [],
    rows: [
      {
        id: "row-1",
        serialNo: 1,
        output: outputRow({
          "S.no": 1,
          "Ticket ID": "WO-123",
          Engineer: "Priya",
          "Customer Mail": "Manual Entry Required",
        }),
        comparison: {
          changeType: "NEW",
          previousFlexStatus: null,
          previousRtplStatus: null,
          previousWipAging: null,
          changedFields: {},
          changeSummary: "New ticket",
        },
        carryForward: {
          carriedForwardFields: ["engineer"],
          manualFieldsCompleted: false,
          manualFieldsMissing: ["customer_mail"],
          changeType: "CARRIED",
          previousTicketMatched: true,
          closedSyntheticRow: false,
        },
        updatedAt: null,
        updatedBy: null,
        rowEditable: true,
        carryForwardSource: "PREVIOUS_FINAL_REPORT",
      },
      {
        id: "row-2",
        serialNo: 2,
        output: outputRow({
          "S.no": 2,
          "Ticket ID": "WO-999",
          Engineer: "Alex",
        }),
        comparison: {
          changeType: "CLOSED",
          previousFlexStatus: "Open",
          previousRtplStatus: "Pending",
          previousWipAging: "5",
          changedFields: {},
          changeSummary: "Ticket closed",
        },
        carryForward: {
          carriedForwardFields: [],
          manualFieldsCompleted: true,
          manualFieldsMissing: [],
          changeType: "CLOSED",
          previousTicketMatched: true,
          closedSyntheticRow: true,
        },
        updatedAt: null,
        updatedBy: null,
        rowEditable: true,
        carryForwardSource: "PREVIOUS_FINAL_REPORT",
      },
    ],
  };
}

describe("buildReportExportMatrix", () => {
  it("adds carry-forward and manual-entry metadata to exported rows", () => {
    const matrix = buildReportExportMatrix(reportFixture());
    const header = matrix[0];
    const carriedRow = matrix[1];
    const closedRow = matrix[2];

    expect(header?.slice(0, EXPORT_METADATA_COLUMNS.length)).toEqual([
      ...EXPORT_METADATA_COLUMNS,
    ]);
    expect(carriedRow?.slice(0, EXPORT_METADATA_COLUMNS.length)).toEqual([
      "NEW",
      "New ticket",
      "CARRIED",
      "Engineer",
      "No",
      "Customer Mail",
      "Customer Mail",
      "No",
    ]);
    expect(closedRow?.slice(0, EXPORT_METADATA_COLUMNS.length)).toEqual([
      "CLOSED",
      "Ticket closed",
      "CLOSED",
      "",
      "Yes",
      "",
      "",
      "Yes",
    ]);
  });
});
