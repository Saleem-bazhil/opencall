import { describe, expect, it } from "vitest";
import type { ComparableReportRow } from "../../types/reportComparison.js";
import { HttpError } from "../../utils/httpError.js";
import { buildReportComparison } from "./compareReportsService.js";

function row(
  overrides: Partial<ComparableReportRow> & Pick<ComparableReportRow, "ticketId">,
): ComparableReportRow {
  const base: ComparableReportRow = {
    rowNumber: overrides.rowNumber ?? 1,
    ticketId: overrides.ticketId,
    flexStatus: overrides.flexStatus ?? "OPEN",
    rtplStatus: overrides.rtplStatus ?? "OPEN",
    wipAging: overrides.wipAging ?? "1",
    wipAgingCategory: overrides.wipAgingCategory ?? "0-2",
    tat: overrides.tat ?? null,
    engineer: overrides.engineer ?? "Engineer A",
    location: overrides.location ?? "Location A",
  };

  if (overrides.rowId !== undefined) {
    base.rowId = overrides.rowId;
  }

  return base;
}

describe("buildReportComparison", () => {
  it("classifies new, closed, carried, and updated tickets in O(n) map output", () => {
    const comparison = buildReportComparison({
      currentSessionId: "current",
      previousSessionId: "previous",
      currentRows: [
        row({ ticketId: "WO-001", rtplStatus: "CLOSED" }),
        row({ ticketId: "WO-002" }),
        row({ ticketId: "WO-004" }),
      ],
      previousRows: [
        row({ ticketId: "1", rtplStatus: "OPEN" }),
        row({ ticketId: "2" }),
        row({ ticketId: "3" }),
      ],
    });

    expect(comparison.summary).toEqual({
      total_tickets: 4,
      new_count: 1,
      closed_count: 1,
      updated_count: 1,
      carried_count: 1,
    });
    expect(
      comparison.rowDiffs.map((diff) => [diff.normalizedTicketId, diff.changeType]),
    ).toEqual([
      ["1", "UPDATED"],
      ["2", "CARRIED"],
      ["3", "CLOSED"],
      ["4", "NEW"],
    ]);
    expect(comparison.rowDiffs[0]?.changedFields).toEqual({
      rtpl_status: {
        from: "OPEN",
        to: "CLOSED",
      },
    });
    expect(comparison.rowDiffs[0]?.insight.changeSummary).toBe(
      "RTPL changed from OPEN -> CLOSED",
    );
  });

  it("selects the lowest row number when duplicate ticket IDs exist", () => {
    const comparison = buildReportComparison({
      currentSessionId: "current",
      previousSessionId: "previous",
      currentRows: [
        row({ ticketId: "WO-100", rowNumber: 2, flexStatus: "CHANGED" }),
        row({ ticketId: "100", rowNumber: 1, flexStatus: "OPEN" }),
      ],
      previousRows: [row({ ticketId: "100", rowNumber: 1, flexStatus: "OPEN" })],
    });

    expect(comparison.summary.carried_count).toBe(1);
    expect(comparison.summary.updated_count).toBe(0);
    expect(comparison.duplicateTicketIds.current).toEqual([]);
  });

  it("normalizes numeric WIP aging before comparing but stores diff values as strings", () => {
    const carried = buildReportComparison({
      currentSessionId: "current",
      previousSessionId: "previous",
      currentRows: [row({ ticketId: "200", wipAging: "5.0" })],
      previousRows: [row({ ticketId: "WO200", wipAging: "5" })],
    });
    expect(carried.summary.carried_count).toBe(1);

    const updated = buildReportComparison({
      currentSessionId: "current",
      previousSessionId: "previous",
      currentRows: [row({ ticketId: "200", wipAging: "6" })],
      previousRows: [row({ ticketId: "WO200", wipAging: "5" })],
    });
    expect(updated.rowDiffs[0]?.changedFields.wip_aging).toEqual({
      from: "5",
      to: "6",
    });
  });

  it("rejects empty datasets with validation errors", () => {
    expect(() =>
      buildReportComparison({
        currentSessionId: "current",
        previousSessionId: "previous",
        currentRows: [],
        previousRows: [row({ ticketId: "1" })],
      }),
    ).toThrow(HttpError);

    try {
      buildReportComparison({
        currentSessionId: "current",
        previousSessionId: "previous",
        currentRows: [],
        previousRows: [row({ ticketId: "1" })],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(422);
    }
  });
});
