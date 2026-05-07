import { query } from "../../config/database.js";

interface RequiredColumn {
  tableName: string;
  columnName: string;
}

interface InformationSchemaColumnRow {
  table_name: string;
  column_name: string;
}

export interface RuntimeVerificationResult {
  ok: boolean;
  checkedAt: string;
  missingTables: string[];
  missingColumns: RequiredColumn[];
}

const REQUIRED_TABLES = [
  "source_upload_batches",
  "flex_wip_records",
  "renderways_records",
  "call_plan_records",
  "pincode_area_mappings",
  "sla_rules",
  "daily_call_plan_reports",
  "daily_call_plan_report_rows",
  "report_comparisons",
  "report_row_diffs",
] as const;

const REQUIRED_COLUMNS: readonly RequiredColumn[] = [
  { tableName: "source_upload_batches", columnName: "source_type" },
  { tableName: "source_upload_batches", columnName: "status" },
  { tableName: "source_upload_batches", columnName: "row_count" },
  { tableName: "source_upload_batches", columnName: "region_id" },
  { tableName: "flex_wip_records", columnName: "normalized_ticket_id" },
  { tableName: "flex_wip_records", columnName: "normalized_case_id" },
  { tableName: "flex_wip_records", columnName: "customer_pincode" },
  { tableName: "renderways_records", columnName: "normalized_ticket_id" },
  { tableName: "renderways_records", columnName: "normalized_case_id" },
  { tableName: "renderways_records", columnName: "partner_accept" },
  { tableName: "renderways_records", columnName: "rtpl_status" },
  { tableName: "call_plan_records", columnName: "normalized_ticket_id" },
  { tableName: "call_plan_records", columnName: "morning_status" },
  { tableName: "sla_rules", columnName: "wip_aging_category" },
  { tableName: "sla_rules", columnName: "sla_hours" },
  { tableName: "pincode_area_mappings", columnName: "pincode" },
  { tableName: "pincode_area_mappings", columnName: "area_name" },
  { tableName: "daily_call_plan_reports", columnName: "report_date" },
  { tableName: "daily_call_plan_report_rows", columnName: "match_status" },
  { tableName: "daily_call_plan_report_rows", columnName: "match_notes" },
  { tableName: "daily_call_plan_report_rows", columnName: "change_type" },
  { tableName: "daily_call_plan_report_rows", columnName: "changed_fields" },
  { tableName: "daily_call_plan_report_rows", columnName: "change_summary" },
  { tableName: "daily_call_plan_report_rows", columnName: "carried_forward_fields" },
  { tableName: "daily_call_plan_report_rows", columnName: "manual_fields_completed" },
  { tableName: "daily_call_plan_report_rows", columnName: "manual_fields_missing" },
  { tableName: "daily_call_plan_report_rows", columnName: "remarks" },
  { tableName: "daily_call_plan_report_rows", columnName: "manual_notes" },
  { tableName: "daily_call_plan_report_rows", columnName: "updated_at" },
  { tableName: "daily_call_plan_report_rows", columnName: "updated_by" },
  { tableName: "report_comparisons", columnName: "current_session_id" },
  { tableName: "report_comparisons", columnName: "previous_session_id" },
  { tableName: "report_comparisons", columnName: "summary_json" },
  { tableName: "report_row_diffs", columnName: "ticket_id" },
  { tableName: "report_row_diffs", columnName: "change_type" },
  { tableName: "report_row_diffs", columnName: "changed_fields" },
];

export async function verifyRuntimeSchema(): Promise<RuntimeVerificationResult> {
  const result = await query<InformationSchemaColumnRow>(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [REQUIRED_TABLES],
  );
  const tableNames = new Set(result.rows.map((row) => row.table_name));
  const columnKeys = new Set(
    result.rows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const missingTables = REQUIRED_TABLES.filter(
    (tableName) => !tableNames.has(tableName),
  );
  const missingColumns = REQUIRED_COLUMNS.filter((column) => {
    return !columnKeys.has(`${column.tableName}.${column.columnName}`);
  });

  return {
    ok: missingTables.length === 0 && missingColumns.length === 0,
    checkedAt: new Date().toISOString(),
    missingTables,
    missingColumns,
  };
}
