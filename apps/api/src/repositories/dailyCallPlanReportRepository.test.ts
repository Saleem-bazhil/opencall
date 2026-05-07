import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { EnrichedCallPlanRow, MatchedCallPlanRecord } from "../types/matching.js";
import type { GeneratedDailyCallPlanRow } from "../types/reportGeneration.js";
import {
  insertDailyCallPlanReportRows,
  updateDailyCallPlanReportRowManualFields,
} from "./dailyCallPlanReportRepository.js";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../config/database.js", () => ({
  query: mocks.query,
}));

function enrichedRow(): EnrichedCallPlanRow {
  return {
    ticket_id: "WO-123",
    case_id: "CASE-1",
    case_created_time: null,
    wip_aging: "2",
    rtpl_status: "Pending customer",
    segment: "Enterprise",
    engineer: "Priya",
    product: "Notebook",
    product_line_name: "Commercial",
    work_location: "ASPS01461",
    flex_status: "Open",
    hp_owner_status: null,
    wo_otc_code: "OTC",
    account_name: "Account",
    customer_name: "Customer",
    location: "Chennai",
    contact: null,
    part: null,
    wip_aging_category: null,
    tat: null,
    customer_mail: "customer@example.com",
    rca: "Awaiting part",
    remarks: null,
    manual_notes: null,
    match_status: "MATCHED",
  };
}

function matchFor(enriched: EnrichedCallPlanRow): MatchedCallPlanRecord {
  return {
    renderways: null,
    flexWip: null,
    callPlan: null,
    flexMatchConfidence: "TICKET_ID",
    callPlanMatchConfidence: "UNMATCHED",
    matchStatus: "MATCHED",
    enrichedRow: enriched,
    notes: ["metadata persistence test"],
  };
}

function generatedRow(): GeneratedDailyCallPlanRow {
  const enriched = enrichedRow();

  return {
    id: null,
    serialNo: 1,
    enriched,
    match: matchFor(enriched),
    comparison: null,
    carryForward: {
      carriedForwardFields: ["engineer", "customer_mail"],
      manualFieldsCompleted: true,
      manualFieldsMissing: [],
      changeType: "CARRIED",
      previousTicketMatched: true,
      closedSyntheticRow: false,
    },
    updatedAt: null,
    updatedBy: null,
    rowEditable: true,
    carryForwardSource: "PREVIOUS_FINAL_REPORT",
    output: {
      "S.no": 1,
      "Ticket ID": "WO-123",
      "Case ID": "CASE-1",
      "Case Created Time": "",
      "WIP aging": "2",
      "RTPL status": "Pending customer",
      Segment: "Enterprise",
      Engineer: "Priya",
      Product: "Notebook",
      "Product Line Name": "Commercial",
      "Work Location": "ASPS01461",
      "Flex Status": "Open",
      "HP Owner Status": "",
      "WO OTC CODE": "OTC",
      "Account Name": "Account",
      "Customer Name": "Customer",
      Location: "Chennai",
      Contact: "",
      Part: "",
      "WIP Aging Category": "",
      TAT: "",
      "Customer Mail": "customer@example.com",
      RCA: "Awaiting part",
    },
  };
}

describe("insertDailyCallPlanReportRows", () => {
  it("persists carry-forward metadata on final report rows", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "row-1", updated_at: null, updated_by: null }],
    });
    const client = { query } as unknown as PoolClient;

    await insertDailyCallPlanReportRows(client, "report-1", [generatedRow()]);

    expect(query).toHaveBeenCalledOnce();
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("carried_forward_fields");
    expect(sql).toContain("manual_fields_completed");
    expect(sql).toContain("manual_fields_missing");
    expect(values[30]).toBe(JSON.stringify(["engineer", "customer_mail"]));
    expect(values[31]).toBe(true);
    expect(values[32]).toEqual([]);
  });

  it("updates only the addressed report row for persisted manual edits", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "row-1",
          report_id: "report-1",
          region_id: "region-1",
          engineer: "Mike",
          rtpl_status: "Pending",
          customer_mail: "customer@example.com",
          rca: "Updated RCA",
          remarks: null,
          manual_notes: null,
          location: "Chennai",
          segment: "Enterprise",
          manual_fields_completed: true,
          manual_fields_missing: [],
          updated_at: "2026-05-07T00:00:00.000Z",
          updated_by: "user-1",
        },
      ],
    });

    await updateDailyCallPlanReportRowManualFields("row-1", {
      engineer: "Mike",
      rtplStatus: "Pending",
      customerMail: "customer@example.com",
      rca: "Updated RCA",
      remarks: null,
      manualNotes: null,
      location: "Chennai",
      segment: "Enterprise",
      manualFieldsCompleted: true,
      manualFieldsMissing: [],
      updatedBy: "user-1",
    });

    const [sql, values] = mocks.query.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("WHERE rows.id = $1");
    expect(sql).not.toContain("DELETE");
    expect(sql).not.toContain("daily_call_plan_reports SET");
    expect(values[0]).toBe("row-1");
  });
});
