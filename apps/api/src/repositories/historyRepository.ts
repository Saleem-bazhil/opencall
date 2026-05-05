import type { PoolClient } from "pg";
import { query } from "../config/database.js";

export interface ReportHistorySessionRow {
  id: string;
  user_id: string;
  title: string;
  status: "DRAFT" | "COMPLETED";
  region_id: string | null;
  flex_upload_batch_id: string | null;
  renderways_upload_batch_id: string | null;
  call_plan_upload_batch_id: string | null;
  daily_call_plan_report_id: string | null;
  total_rows: number;
  created_at: string;
  updated_at: string;
}

export async function createHistorySession(
  client: PoolClient | null,
  session: {
    userId: string;
    title: string;
    regionId?: string | null;
    flexUploadBatchId?: string | null;
    renderwaysUploadBatchId?: string | null;
    callPlanUploadBatchId?: string | null;
  },
): Promise<ReportHistorySessionRow> {
  const sql = `
    INSERT INTO report_history_sessions (
      user_id, title, status, region_id,
      flex_upload_batch_id, renderways_upload_batch_id, call_plan_upload_batch_id
    ) VALUES ($1, $2, 'DRAFT', $3, $4, $5, $6)
    RETURNING *;
  `;
  const params = [
    session.userId,
    session.title,
    session.regionId ?? null,
    session.flexUploadBatchId ?? null,
    session.renderwaysUploadBatchId ?? null,
    session.callPlanUploadBatchId ?? null,
  ];

  const result = client
    ? await client.query<ReportHistorySessionRow>(sql, params)
    : await query<ReportHistorySessionRow>(sql, params);

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to create history session");
  }
  return row;
}

export async function updateHistorySessionToCompleted(
  client: PoolClient | null,
  flexUploadBatchId: string,
  dailyCallPlanReportId: string,
  totalRows: number,
): Promise<ReportHistorySessionRow | null> {
  const sql = `
    UPDATE report_history_sessions
    SET
      status = 'COMPLETED',
      daily_call_plan_report_id = $2,
      total_rows = $3,
      updated_at = NOW()
    WHERE flex_upload_batch_id = $1
    RETURNING *;
  `;
  const params = [flexUploadBatchId, dailyCallPlanReportId, totalRows];

  const result = client
    ? await client.query<ReportHistorySessionRow>(sql, params)
    : await query<ReportHistorySessionRow>(sql, params);

  return result.rows[0] ?? null;
}

export async function getHistorySessionsByUser(
  userId: string,
): Promise<ReportHistorySessionRow[]> {
  const sql = `
    SELECT *
    FROM report_history_sessions
    WHERE user_id = $1
    ORDER BY created_at DESC;
  `;
  const result = await query<ReportHistorySessionRow>(sql, [userId]);
  return result.rows;
}

export async function getHistorySessionById(
  id: string,
  userId: string,
): Promise<ReportHistorySessionRow | null> {
  const sql = `
    SELECT *
    FROM report_history_sessions
    WHERE id = $1 AND user_id = $2
    LIMIT 1;
  `;
  const result = await query<ReportHistorySessionRow>(sql, [id, userId]);
  return result.rows[0] ?? null;
}

export async function updateHistorySessionTitle(
  id: string,
  userId: string,
  title: string,
): Promise<ReportHistorySessionRow | null> {
  const sql = `
    UPDATE report_history_sessions
    SET title = $3, updated_at = NOW()
    WHERE id = $1 AND user_id = $2
    RETURNING *;
  `;
  const result = await query<ReportHistorySessionRow>(sql, [id, userId, title]);
  return result.rows[0] ?? null;
}

export async function deleteHistorySession(
  id: string,
  userId: string,
): Promise<boolean> {
  const sql = `
    DELETE FROM report_history_sessions
    WHERE id = $1 AND user_id = $2;
  `;
  const result = await query(sql, [id, userId]);
  return (result.rowCount ?? 0) > 0;
}
