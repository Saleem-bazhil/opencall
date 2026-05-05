import {
  getHistorySessionsByUser,
  getHistorySessionById,
  updateHistorySessionTitle,
  deleteHistorySession,
  createHistorySession,
} from "../repositories/historyRepository.js";

export async function listReportHistory(userId: string) {
  const sessions = await getHistorySessionsByUser(userId);
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    regionId: s.region_id,
    totalRows: s.total_rows,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }));
}

export async function getReportHistoryDetail(id: string, userId: string) {
  const session = await getHistorySessionById(id, userId);
  if (!session) {
    throw new Error("History session not found");
  }
  
  // We return the batch IDs so the frontend can use them
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    regionId: session.region_id,
    flexUploadBatchId: session.flex_upload_batch_id,
    renderwaysUploadBatchId: session.renderways_upload_batch_id,
    callPlanUploadBatchId: session.call_plan_upload_batch_id,
    reportId: session.daily_call_plan_report_id,
    totalRows: session.total_rows,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  };
}

export async function renameReportHistory(id: string, userId: string, title: string) {
  const session = await updateHistorySessionTitle(id, userId, title);
  if (!session) {
    throw new Error("History session not found");
  }
  return { id: session.id, title: session.title };
}

export async function removeReportHistory(id: string, userId: string) {
  const success = await deleteHistorySession(id, userId);
  if (!success) {
    throw new Error("History session not found or could not be deleted");
  }
  return { success };
}

export async function duplicateReportHistory(id: string, userId: string) {
  const existing = await getHistorySessionById(id, userId);
  if (!existing) {
    throw new Error("History session not found");
  }
  
  const duplicated = await createHistorySession(null, {
    userId,
    title: `${existing.title} (Copy)`,
    regionId: existing.region_id,
    flexUploadBatchId: existing.flex_upload_batch_id,
    renderwaysUploadBatchId: existing.renderways_upload_batch_id,
    callPlanUploadBatchId: existing.call_plan_upload_batch_id,
  });
  
  return { id: duplicated.id, title: duplicated.title };
}
