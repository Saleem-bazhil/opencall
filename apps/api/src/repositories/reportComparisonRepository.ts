import type { PoolClient } from "pg";
import type {
  ReportChangedFields,
  ReportChangeType,
  ReportComparisonSummary,
  ReportRowComparisonInsight,
} from "@opencall/shared";
import type { ComparableReportRow } from "../types/reportComparison.js";

export interface ReportComparisonSessionRow {
  id: string;
  reportId: string;
  reportDate: string;
  regionId: string | null;
  status: string;
}

interface ReportComparisonSessionDbRow {
  id: string;
  report_id: string;
  report_date: string;
  region_id: string | null;
  status: string;
}

interface ComparableReportDbRow {
  row_id: string;
  serial_no: number;
  ticket_id: string;
  flex_status: string | null;
  rtpl_status: string | null;
  wip_aging: string | null;
  wip_aging_category: string | null;
  tat: string | null;
  engineer: string | null;
  location: string | null;
}

function mapSession(row: ReportComparisonSessionDbRow): ReportComparisonSessionRow {
  return {
    id: row.id,
    reportId: row.report_id,
    reportDate: row.report_date,
    regionId: row.region_id,
    status: row.status,
  };
}

function mapComparableRow(row: ComparableReportDbRow): ComparableReportRow {
  return {
    rowId: row.row_id,
    rowNumber: row.serial_no,
    ticketId: row.ticket_id,
    flexStatus: row.flex_status,
    rtplStatus: row.rtpl_status,
    wipAging: row.wip_aging,
    wipAgingCategory: row.wip_aging_category,
    tat: row.tat,
    engineer: row.engineer,
    location: row.location,
  };
}

export async function findComparisonSessionById(
  client: PoolClient,
  sessionId: string,
): Promise<ReportComparisonSessionRow | null> {
  const result = await client.query<ReportComparisonSessionDbRow>(
    `
      SELECT
        rhs.id,
        rhs.daily_call_plan_report_id AS report_id,
        dcr.report_date,
        rhs.region_id,
        rhs.status
      FROM report_history_sessions rhs
      JOIN daily_call_plan_reports dcr
        ON dcr.id = rhs.daily_call_plan_report_id
      WHERE rhs.id = $1
      LIMIT 1
    `,
    [sessionId],
  );

  const row = result.rows[0];
  return row ? mapSession(row) : null;
}

export async function findPreviousCompletedComparisonSession(
  client: PoolClient,
  currentSessionId: string,
): Promise<ReportComparisonSessionRow | null> {
  const result = await client.query<ReportComparisonSessionDbRow>(
    `
      WITH current_session AS (
        SELECT
          rhs.id,
          rhs.region_id,
          dcr.report_date
        FROM report_history_sessions rhs
        JOIN daily_call_plan_reports dcr
          ON dcr.id = rhs.daily_call_plan_report_id
        WHERE rhs.id = $1
      )
      SELECT
        previous.id,
        previous.daily_call_plan_report_id AS report_id,
        previous_report.report_date,
        previous.region_id,
        previous.status
      FROM current_session current
      JOIN report_history_sessions previous
        ON previous.id <> current.id
       AND previous.status = 'COMPLETED'
       AND previous.daily_call_plan_report_id IS NOT NULL
       AND previous.region_id IS NOT DISTINCT FROM current.region_id
      JOIN daily_call_plan_reports previous_report
        ON previous_report.id = previous.daily_call_plan_report_id
       AND previous_report.report_date = current.report_date - INTERVAL '1 day'
      ORDER BY previous.updated_at DESC, previous.id ASC
      LIMIT 1
    `,
    [currentSessionId],
  );

  const row = result.rows[0];
  return row ? mapSession(row) : null;
}

export async function findComparableReportRowsBySessionId(
  client: PoolClient,
  sessionId: string,
): Promise<ComparableReportRow[]> {
  const result = await client.query<ComparableReportDbRow>(
    `
      SELECT
        rows.id AS row_id,
        rows.serial_no,
        rows.ticket_id,
        rows.flex_status,
        rows.rtpl_status,
        rows.wip_aging,
        rows.wip_aging_category,
        rows.tat::TEXT AS tat,
        rows.engineer,
        rows.location
      FROM report_history_sessions sessions
      JOIN daily_call_plan_report_rows rows
        ON rows.report_id = sessions.daily_call_plan_report_id
      WHERE sessions.id = $1
      ORDER BY rows.serial_no ASC, rows.id ASC
    `,
    [sessionId],
  );

  return result.rows.map(mapComparableRow);
}

export async function replaceReportComparison(
  client: PoolClient,
  input: {
    currentSessionId: string;
    previousSessionId: string;
    summary: ReportComparisonSummary;
    rowDiffs: readonly {
      ticketId: string;
      changeType: ReportChangeType;
      changedFields: ReportChangedFields;
    }[];
  },
): Promise<string> {
  await client.query(
    `
      DELETE FROM report_row_diffs
      WHERE current_session_id = $1
    `,
    [input.currentSessionId],
  );
  await client.query(
    `
      DELETE FROM report_comparisons
      WHERE current_session_id = $1
    `,
    [input.currentSessionId],
  );

  const comparisonResult = await client.query<{ id: string }>(
    `
      INSERT INTO report_comparisons (
        current_session_id,
        previous_session_id,
        summary_json
      )
      VALUES ($1, $2, $3::jsonb)
      RETURNING id
    `,
    [
      input.currentSessionId,
      input.previousSessionId,
      JSON.stringify(input.summary),
    ],
  );

  if (input.rowDiffs.length > 0) {
    await client.query(
      `
        INSERT INTO report_row_diffs (
          ticket_id,
          current_session_id,
          previous_session_id,
          change_type,
          changed_fields
        )
        SELECT
          diff.ticket_id,
          $1,
          $2,
          diff.change_type::report_change_type,
          diff.changed_fields
        FROM jsonb_to_recordset($3::jsonb) AS diff(
          ticket_id TEXT,
          change_type TEXT,
          changed_fields JSONB
        )
      `,
      [
        input.currentSessionId,
        input.previousSessionId,
        JSON.stringify(
          input.rowDiffs.map((diff) => ({
            ticket_id: diff.ticketId,
            change_type: diff.changeType,
            changed_fields: diff.changedFields,
          })),
        ),
      ],
    );
  }

  const comparison = comparisonResult.rows[0];
  if (!comparison) {
    throw new Error("Report comparison insert did not return an id");
  }

  return comparison.id;
}

export async function updateCurrentReportRowComparisonInsights(
  client: PoolClient,
  currentSessionId: string,
  insights: ReadonlyMap<string, ReportRowComparisonInsight>,
): Promise<void> {
  if (insights.size === 0) {
    return;
  }

  await client.query(
    `
      WITH insight_rows AS (
        SELECT *
        FROM jsonb_to_recordset($2::jsonb) AS insight(
          row_id UUID,
          change_type TEXT,
          previous_flex_status TEXT,
          previous_rtpl_status TEXT,
          previous_wip_aging TEXT,
          changed_fields JSONB,
          change_summary TEXT
        )
      )
      UPDATE daily_call_plan_report_rows rows
      SET
        change_type = insight.change_type::report_change_type,
        previous_flex_status = insight.previous_flex_status,
        previous_rtpl_status = insight.previous_rtpl_status,
        previous_wip_aging = insight.previous_wip_aging,
        changed_fields = insight.changed_fields,
        change_summary = insight.change_summary
      FROM report_history_sessions sessions, insight_rows insight
      WHERE sessions.id = $1
        AND rows.id = insight.row_id
        AND rows.report_id = sessions.daily_call_plan_report_id
    `,
    [
      currentSessionId,
      JSON.stringify(
        [...insights.entries()].map(([rowId, insight]) => ({
          row_id: rowId,
          change_type: insight.changeType,
          previous_flex_status: insight.previousFlexStatus,
          previous_rtpl_status: insight.previousRtplStatus,
          previous_wip_aging: insight.previousWipAging,
          changed_fields: insight.changedFields,
          change_summary: insight.changeSummary,
        })),
      ),
    ],
  );
}
