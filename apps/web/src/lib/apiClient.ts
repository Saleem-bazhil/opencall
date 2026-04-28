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
  }>;
}

export interface MatchPreviewResponse {
  totalRenderwaysRows: number;
  flexMatchedRows: number;
  callPlanMatchedRows: number;
  unmatchedFlexRows: number;
  unmatchedCallPlanRows: number;
  matchStatusCounts: Record<string, number>;
  enrichedRows: Array<Record<string, string | number | null>>;
}

export interface GeneratedReportResponse {
  reportId: string;
  reportDate: string;
  columns: readonly string[];
  totalRows: number;
  duplicateTicketCount: number;
  unmatchedTicketCount: number;
  rows: Array<{
    serialNo: number;
    output: Record<string, string | number>;
  }>;
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
  renderwaysReport: File;
  callPlan: File;
}): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("flexWipReport", input.flexWipReport);
  formData.append("renderwaysReport", input.renderwaysReport);
  formData.append("callPlan", input.callPlan);

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
  flexUploadBatchId: string;
  renderwaysUploadBatchId: string;
  callPlanUploadBatchId: string;
}): Promise<MatchPreviewResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/matches/preview`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      flexUploadBatchId: input.flexUploadBatchId,
      renderwaysUploadBatchId: input.renderwaysUploadBatchId,
      callPlanUploadBatchId: input.callPlanUploadBatchId,
    }),
  });

  return readJson<MatchPreviewResponse>(response);
}

export async function generateReport(input: {
  token: string;
  regionId: string;
  reportDate: string;
  flexUploadBatchId: string;
  renderwaysUploadBatchId: string;
  callPlanUploadBatchId: string;
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
        renderwaysUploadBatchId: input.renderwaysUploadBatchId,
        callPlanUploadBatchId: input.callPlanUploadBatchId,
      }),
    },
  );

  return readJson<GeneratedReportResponse>(response);
}
