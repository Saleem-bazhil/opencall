import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import { describe, expect, it } from "vitest";
import type { GeneratedReportResponse } from "./apiClient";
import {
  buildOverallWoOtcBreakdown,
  buildRtplOperationalAnalytics,
  filterRowsByRegion,
  reportWithRows,
} from "./reportDashboardAnalytics";

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

function row(
  serialNo: number,
  overrides: Partial<Record<string, string | number>>,
): GeneratedReportResponse["rows"][number] {
  return {
    id: `row-${serialNo}`,
    serialNo,
    output: outputRow({ "S.no": serialNo, ...overrides }),
    comparison: null,
    carryForward: {
      carriedForwardFields: [],
      manualFieldsCompleted: true,
      manualFieldsMissing: [],
      changeType: null,
      previousTicketMatched: false,
      closedSyntheticRow: false,
    },
    updatedAt: null,
    updatedBy: null,
    rowEditable: true,
    carryForwardSource: "PREVIOUS_FINAL_REPORT",
  };
}

function reportFixture(): GeneratedReportResponse {
  return {
    reportId: "report-1",
    sessionId: "session-1",
    reportDate: "2026-05-07",
    columns: DAILY_CALL_PLAN_COLUMNS,
    totalRows: 3,
    duplicateTicketCount: 0,
    unmatchedTicketCount: 0,
    duplicateTracking: {
      flexWip: 0,
      renderways: 0,
      callPlan: 0,
      total: 0,
    },
    carryForward: {
      totalFieldsCarried: 0,
      rowsAutoCompleted: 0,
      rowsStillManual: 0,
    },
    comparison: {
      skipped: true,
      reason: "NO_PREVIOUS_REPORT",
      currentSessionId: "session-1",
      previousSessionId: null,
      summary: null,
      duplicateTicketIds: {
        current: [],
        previous: [],
      },
    },
    regionBreakdown: [
      {
        aspCode: "ASPS01461",
        regionName: "CHENNAI",
        count: 2,
        woOtcCodeBreakdown: [
          { code: "05K-Extended Warranty", count: 1 },
          { code: "01-Trade", count: 1 },
        ],
      },
      {
        aspCode: "UNKNOWN",
        regionName: "Unknown Region",
        count: 1,
        woOtcCodeBreakdown: [
          { code: "05K-Extended Warranty", count: 1 },
        ],
      },
    ],
    rows: [
      row(1, {
        "Ticket ID": "WO-1",
        "Work Location": "ASPS01461",
        "RTPL status": "Completed",
      }),
      row(2, {
        "Ticket ID": "WO-2",
        "Work Location": "ASPS01461",
        "RTPL status": "Hold",
      }),
      row(3, {
        "Ticket ID": "WO-3",
        "Work Location": "UNKNOWN",
        "RTPL status": "Completed",
      }),
    ],
  };
}

describe("reportDashboardAnalytics", () => {
  it("preserves the existing All Regions contract breakdown aggregation", () => {
    expect(buildOverallWoOtcBreakdown(reportFixture().regionBreakdown)).toEqual([
      { code: "05K-Extended Warranty", count: 2 },
      { code: "01-Trade", count: 1 },
    ]);
  });

  it("builds dynamic RTPL metrics from real row statuses only", () => {
    const metrics = buildRtplOperationalAnalytics([
      ...reportFixture().rows,
      row(4, {
        "Ticket ID": "WO-4",
        "Work Location": "ASPS01461",
        "RTPL status": "Manual Entry Required",
      }),
    ]);

    expect(metrics).toEqual([
      { status: "Completed", count: 2 },
      { status: "Hold", count: 1 },
    ]);
  });

  it("filters rows by region for region-aware analytics and export", () => {
    const report = reportFixture();
    const chennaiRows = filterRowsByRegion(report.rows, "ASPS01461");
    const exportReport = reportWithRows(report, chennaiRows);

    expect(chennaiRows.map((reportRow) => reportRow.output["Ticket ID"])).toEqual([
      "WO-1",
      "WO-2",
    ]);
    expect(exportReport.totalRows).toBe(2);
    expect(exportReport.regionBreakdown).toBe(report.regionBreakdown);
  });
});
