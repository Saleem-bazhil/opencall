import type { PoolClient } from "pg";
import type {
  GeneratedDailyCallPlanRow,
  GenerateDailyCallPlanInput,
} from "../types/reportGeneration.js";

interface DailyReportRow {
  id: string;
}

export async function createDailyCallPlanReport(
  client: PoolClient,
  input: GenerateDailyCallPlanInput,
  totals: {
    totalRows: number;
    duplicateTicketCount: number;
    unmatchedTicketCount: number;
  },
): Promise<string> {
  const result = await client.query<DailyReportRow>(
    `
      INSERT INTO daily_call_plan_reports (
        report_date,
        region_id,
        generated_by,
        flex_upload_batch_id,
        renderways_upload_batch_id,
        call_plan_upload_batch_id,
        total_rows,
        duplicate_ticket_count,
        unmatched_ticket_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `,
    [
      input.reportDate,
      input.regionId,
      input.generatedBy,
      input.flexUploadBatchId,
      input.renderwaysUploadBatchId ?? null,
      input.callPlanUploadBatchId ?? null,
      totals.totalRows,
      totals.duplicateTicketCount,
      totals.unmatchedTicketCount,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Daily call plan report insert did not return a row");
  }

  return row.id;
}

export async function insertDailyCallPlanReportRows(
  client: PoolClient,
  reportId: string,
  rows: readonly GeneratedDailyCallPlanRow[],
): Promise<void> {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO daily_call_plan_report_rows (
          report_id,
          serial_no,
          ticket_id,
          case_id,
          case_created_time,
          wip_aging,
          rtpl_status,
          segment,
          engineer,
          product,
          flex_status,
          hp_owner_status,
          wo_otc_code,
          account_name,
          customer_name,
          location,
          contact,
          part,
          wip_aging_category,
          tat,
          customer_mail,
          rca,
          match_status,
          match_notes
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24::jsonb
        )
      `,
      [
        reportId,
        row.serialNo,
        row.enriched.ticket_id,
        row.enriched.case_id || null,
        row.enriched.case_created_time,
        row.enriched.wip_aging,
        row.enriched.rtpl_status,
        row.enriched.segment,
        row.enriched.engineer,
        row.enriched.product,
        row.enriched.flex_status,
        row.enriched.hp_owner_status,
        row.enriched.wo_otc_code,
        row.enriched.account_name,
        row.enriched.customer_name,
        row.enriched.location,
        row.enriched.contact,
        row.enriched.part,
        row.enriched.wip_aging_category,
        row.enriched.tat,
        row.enriched.customer_mail,
        row.enriched.rca,
        row.enriched.match_status,
        JSON.stringify(row.match.notes),
      ],
    );
  }
}
