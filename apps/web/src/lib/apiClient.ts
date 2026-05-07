const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: "SUPER_ADMIN" | "REGION_ADMIN";
    regionId: string | null;
    region_id: string | null;
  };
}

export interface UploadBatch {
  id: string;
  sourceType: "FLEX_WIP" | "RENDERWAYS" | "CALL_PLAN";
  originalFileName: string;
  status: "UPLOADED" | "VALIDATED" | "FAILED" | "PROCESSED";
  rowCount: number;
  errorCount: number;
  createdAt: string;
}

export interface UploadResponse {
  batches: UploadBatch[];
  validations: Array<{
    sourceType: string;
    originalFileName: string;
    rowNumber: number | null;
    isValid: boolean;
    detectedHeaders: string[];
    missingColumns: string[];
  }>;
  parseSummaries: Array<{
    sourceType: string;
    rowCount: number;
    issueCount: number;
    duplicateNormalizedTicketIds: string[];
    duplicateNormalizedCaseIds: string[];
    duplicateCount: number;
  }>;
}

export interface MatchPreviewResponse {
  totalRenderwaysRows: number;
  totalFlexRows?: number;
  flexMatchedRows: number;
  callPlanMatchedRows: number;
  unmatchedFlexRows: number;
  unmatchedCallPlanRows: number;
  duplicateTracking: {
    flexWip: number;
    renderways: number;
    callPlan: number;
    total: number;
  };
  matchStatusCounts: Record<string, number>;
  enrichedRows: Array<Record<string, string | number | null>>;
}

export interface GeneratedReportResponse {
  reportId: string;
  sessionId: string;
  reportDate: string;
  columns: readonly string[];
  totalRows: number;
  duplicateTicketCount: number;
  unmatchedTicketCount: number;
  duplicateTracking: {
    flexWip: number;
    renderways: number;
    callPlan: number;
    total: number;
  };
  carryForward: {
    totalFieldsCarried: number;
    rowsAutoCompleted: number;
    rowsStillManual: number;
  };
  comparison: {
    skipped: boolean;
    reason: "NO_PREVIOUS_REPORT" | null;
    currentSessionId: string;
    previousSessionId: string | null;
    summary: {
      total_tickets: number;
      new_count: number;
      closed_count: number;
      updated_count: number;
      carried_count: number;
    } | null;
    duplicateTicketIds: {
      current: string[];
      previous: string[];
    };
  };
  regionBreakdown: Array<{
    aspCode: string;
    regionName: string;
    count: number;
    woOtcCodeBreakdown: Array<{
      code: string;
      count: number;
    }>;
  }>;
  rows: Array<{
    id: string | null;
    serialNo: number;
    output: Record<string, string | number>;
    comparison: {
      changeType: "NEW" | "CLOSED" | "CARRIED" | "UPDATED" | null;
      previousFlexStatus: string | null;
      previousRtplStatus: string | null;
      previousWipAging: string | null;
      changedFields: Record<
        string,
        {
          from: string | null;
          to: string | null;
        }
      >;
      changeSummary: string | null;
    } | null;
    carryForward: {
      carriedForwardFields: string[];
      manualFieldsCompleted: boolean;
      manualFieldsMissing: string[];
      changeType: "NEW" | "CLOSED" | "CARRIED" | "UPDATED" | "NEW_WORK_ORDER" | null;
      previousTicketMatched: boolean;
      closedSyntheticRow: boolean;
    };
    updatedAt: string | null;
    updatedBy: string | null;
    rowEditable: boolean;
    carryForwardSource: "PREVIOUS_FINAL_REPORT";
  }>;
}

export interface EditedReportRowResponse {
  id: string;
  reportId: string;
  regionId: string | null;
  engineer: string | null;
  rtplStatus: string | null;
  customerMail: string | null;
  rca: string | null;
  remarks: string | null;
  manualNotes: string | null;
  location: string | null;
  segment: string | null;
  manualFieldsCompleted: boolean;
  manualFieldsMissing: string[];
  updatedAt: string;
  updatedBy: string | null;
  rowEditable: boolean;
  carryForwardSource: "PREVIOUS_FINAL_REPORT";
  carriedForwardFields?: string[];
}

export interface RuntimeHealthResponse {
  status: string;
  ok: boolean;
  missingTables: string[];
  missingColumns: Array<{
    tableName: string;
    columnName: string;
  }>;
}

export interface DatabaseHealthResponse {
  status: string;
  connected: boolean;
  databaseName: string | null;
  latencyMs: number;
  error: string | null;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | { data?: T }
    | ApiErrorBody
    | null;

  if (!response.ok) {
    if (response.status === 422 && body && "data" in body && body.data !== undefined) {
      return body.data as T;
    }
    const errorBody = body as ApiErrorBody | null;
    throw new Error(errorBody?.error?.message ?? `Request failed ${response.status}`);
  }

  if (!body || !("data" in body)) {
    throw new Error("Unexpected API response");
  }

  return body.data as T;
}

export async function login(email: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  return readJson<LoginResponse>(response);
}

export async function getDatabaseHealth(): Promise<DatabaseHealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/health/db`, {
    cache: "no-store",
  });

  return readJson<DatabaseHealthResponse>(response);
}

export async function getRuntimeHealth(): Promise<RuntimeHealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/health/runtime`, {
    cache: "no-store",
  });

  return readJson<RuntimeHealthResponse>(response);
}

export async function uploadReports(input: {
  token: string;
  regionId: string;
  flexWipReport: File;
  renderwaysReport?: File;
  callPlan?: File;
}): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("flexWipReport", input.flexWipReport);
  if (input.renderwaysReport) {
    formData.append("renderwaysReport", input.renderwaysReport);
  }
  if (input.callPlan) {
    formData.append("callPlan", input.callPlan);
  }

  if (input.regionId.trim()) {
    formData.append("regionId", input.regionId.trim());
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
    },
    body: formData,
  });

  return readJson<UploadResponse>(response);
}

export async function previewMatches(input: {
  token: string;
  regionId: string;
  flexUploadBatchId: string;
  renderwaysUploadBatchId?: string;
  callPlanUploadBatchId?: string;
}): Promise<MatchPreviewResponse> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.token}`,
    "Content-Type": "application/json",
  };

  if (input.regionId.trim()) {
    headers["x-region-id"] = input.regionId.trim();
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/matches/preview`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      flexUploadBatchId: input.flexUploadBatchId,
      renderwaysUploadBatchId: input.renderwaysUploadBatchId || null,
      callPlanUploadBatchId: input.callPlanUploadBatchId || null,
    }),
  });

  return readJson<MatchPreviewResponse>(response);
}

export async function generateReport(input: {
  token: string;
  regionId: string;
  reportDate: string;
  flexUploadBatchId: string;
  renderwaysUploadBatchId?: string;
  callPlanUploadBatchId?: string;
}): Promise<GeneratedReportResponse> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.token}`,
    "Content-Type": "application/json",
  };

  if (input.regionId.trim()) {
    headers["x-region-id"] = input.regionId.trim();
  }

  const response = await fetch(
    `${API_BASE_URL}/api/v1/reports/daily-call-plan/generate`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        reportDate: input.reportDate,
        flexUploadBatchId: input.flexUploadBatchId,
        renderwaysUploadBatchId: input.renderwaysUploadBatchId || null,
        callPlanUploadBatchId: input.callPlanUploadBatchId || null,
      }),
    },
  );

  return readJson<GeneratedReportResponse>(response);
}

export async function updateReportRow(input: {
  token: string;
  rowId: string;
  values: {
    engineer?: string | null;
    rtpl_status?: string | null;
    customer_mail?: string | null;
    rca?: string | null;
    remarks?: string | null;
    manual_notes?: string | null;
    location?: string | null;
    segment?: string | null;
  };
}): Promise<EditedReportRowResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/report-rows/${input.rowId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.values),
  });

  return readJson<EditedReportRowResponse>(response);
}

export interface ReportHistorySession {
  id: string;
  title: string;
  status: "DRAFT" | "COMPLETED";
  regionId: string | null;
  flexUploadBatchId: string | null;
  renderwaysUploadBatchId: string | null;
  callPlanUploadBatchId: string | null;
  reportId: string | null;
  totalRows: number;
  createdAt: string;
  updatedAt: string;
}

export async function getReportHistory(token: string): Promise<ReportHistorySession[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/report-history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<ReportHistorySession[]>(response);
}

export async function getReportHistoryById(token: string, id: string): Promise<ReportHistorySession> {
  const response = await fetch(`${API_BASE_URL}/api/v1/report-history/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<ReportHistorySession>(response);
}

export async function renameReportHistory(token: string, id: string, title: string): Promise<{ id: string; title: string }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/report-history/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  return readJson<{ id: string; title: string }>(response);
}

export async function duplicateReportHistory(token: string, id: string): Promise<{ id: string; title: string }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/report-history/${id}/duplicate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<{ id: string; title: string }>(response);
}

export async function deleteReportHistory(token: string, id: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/report-history/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<{ success: boolean }>(response);
}
