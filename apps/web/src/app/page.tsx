"use client";

import { DAILY_CALL_PLAN_COLUMNS, RTPL_STATUS_OPTIONS } from "@opencall/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColumnFilterDropdown } from "../components/ColumnFilterDropdown";
import { useColumnFilters } from "../lib/useColumnFilters";
import { FILTERABLE_COLUMNS } from "../lib/columnFilter";
import {
  generateReport,
  getDatabaseHealth,
  getRuntimeHealth,
  login,
  previewMatches,
  updateReportRow,
  uploadReports,
  type DatabaseHealthResponse,
  type EditedReportRowResponse,
  type GeneratedReportResponse,
  type LoginResponse,
  type MatchPreviewResponse,
  type RuntimeHealthResponse,
  type UploadBatch,
  type UploadResponse,
  type ReportHistorySession,
  getReportHistory,
  getReportHistoryById,
  renameReportHistory,
  deleteReportHistory,
} from "../lib/apiClient";
import { ReportHistoryPanel } from "../components/ReportHistoryPanel";
import { downloadReportAsXlsx, downloadReportAsExcel } from "../lib/excelExport";
import {
  ALL_REGIONS_FILTER,
  buildOverallWoOtcBreakdown,
  buildRtplOperationalAnalytics,
  filterRowsByRegion,
  reportWithRows,
} from "../lib/reportDashboardAnalytics";

type SourceKey = "FLEX_WIP" | "RENDERWAYS" | "CALL_PLAN";
type FileField = "flexWipReport" | "renderwaysReport" | "callPlan";
type ChangeType = "NEW" | "CLOSED" | "CARRIED" | "UPDATED";
type ManualCarryForwardField =
  | "rtpl_status"
  | "segment"
  | "engineer"
  | "location"
  | "customer_mail"
  | "rca";

const SOURCE_LABELS: Record<SourceKey, string> = {
  FLEX_WIP: "Flex WIP",
  RENDERWAYS: "Renderways",
  CALL_PLAN: "Call Plan",
};

const FILE_FIELDS: Array<{
  field: FileField;
  source: SourceKey;
  label: string;
  required: boolean;
}> = [
  { field: "flexWipReport", source: "FLEX_WIP", label: "Flex WIP Report", required: true },
  { field: "renderwaysReport", source: "RENDERWAYS", label: "Renderways / RTPL Report", required: false },
  { field: "callPlan", source: "CALL_PLAN", label: "Call Plan Report", required: false },
];

const MANUAL_ENTRY_REQUIRED = "Manual Entry Required";
const CISS_PRODUCT_LINE = "CISS";

const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  NEW: "New",
  CLOSED: "Closed",
  UPDATED: "Updated",
  CARRIED: "Carried",
};

const CHANGE_FIELD_LABELS: Record<string, string> = {
  flex_status: "Flex Status",
  rtpl_status: "RTPL status",
  wip_aging: "WIP aging",
  wip_aging_category: "WIP Aging Category",
  tat: "TAT",
  engineer: "Engineer",
  location: "Location",
};

function isCissCase(row: GeneratedReportResponse["rows"][number]): boolean {
  return String(row.output["Product Line Name"] ?? "")
    .trim()
    .toUpperCase()
    .includes(CISS_PRODUCT_LINE);
}

const MANUAL_FIELD_BY_COLUMN: Partial<Record<string, ManualCarryForwardField>> = {
  "RTPL status": "rtpl_status",
  Segment: "segment",
  Engineer: "engineer",
  Location: "location",
  "Customer Mail": "customer_mail",
  RCA: "rca",
};

const MANUAL_FIELD_LABELS: Record<ManualCarryForwardField, string> = {
  rtpl_status: "RTPL status",
  segment: "Segment",
  engineer: "Engineer",
  location: "Location",
  customer_mail: "Customer Mail",
  rca: "RCA",
};

const EDITABLE_COLUMN_API_FIELD: Partial<Record<string, string>> = {
  "RTPL status": "rtpl_status",
  Segment: "segment",
  Engineer: "engineer",
  Location: "location",
  "Customer Mail": "customer_mail",
  RCA: "rca",
};

type ReportRowPatchValues = Parameters<typeof updateReportRow>[0]["values"];

const EDITED_RESPONSE_COLUMN: Partial<
  Record<string, keyof Pick<
    EditedReportRowResponse,
    | "rtplStatus"
    | "segment"
    | "engineer"
    | "location"
    | "customerMail"
    | "rca"
  >>
> = {
  "RTPL status": "rtplStatus",
  Segment: "segment",
  Engineer: "engineer",
  Location: "location",
  "Customer Mail": "customerMail",
  RCA: "rca",
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function batchIdBySource(
  batches: readonly UploadBatch[],
  sourceType: SourceKey,
): string {
  return batches.find((batch) => batch.sourceType === sourceType)?.id ?? "";
}

function StatusPill({
  tone,
  children,
}: Readonly<{
  tone: "good" | "warn" | "bad" | "neutral";
  children: React.ReactNode;
}>) {
  return <span className={`statusPill ${tone}`}>{children}</span>;
}

function Metric({
  label,
  value,
  onClick,
  isActive,
}: Readonly<{
  label: string;
  value: string | number;
  onClick?: () => void;
  isActive?: boolean;
}>) {
  return (
    <div
      className="metric"
      onClick={onClick}
      style={
        onClick
          ? {
              cursor: "pointer",
              borderColor: isActive ? "var(--accent)" : undefined,
              background: isActive ? "var(--surface-subtle)" : undefined,
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatComparisonValue(value: string | null): string {
  return value === null || value.trim() === "" ? "blank" : value;
}

function formatFieldList(fields: readonly string[]): string {
  if (fields.length === 0) {
    return "None";
  }

  return fields
    .map((field) => MANUAL_FIELD_LABELS[field as ManualCarryForwardField] ?? field)
    .join(", ");
}

function ChangeTypeBadge({
  comparison,
}: Readonly<{
  comparison: GeneratedReportResponse["rows"][number]["comparison"];
}>) {
  const changeType = comparison?.changeType;

  if (!changeType) {
    return <span className="changeBadge none">Not compared</span>;
  }

  const entries = Object.entries(comparison.changedFields);

  return (
    <span className="changeTooltipWrap" tabIndex={0}>
      <span className={`changeBadge ${changeType.toLowerCase()}`}>
        {CHANGE_TYPE_LABELS[changeType]}
      </span>
      <span className="changeTooltip" role="tooltip">
        <strong>{comparison.changeSummary ?? CHANGE_TYPE_LABELS[changeType]}</strong>
        {entries.length > 0 ? (
          <span className="changeTooltipList">
            {entries.map(([field, change]) => (
              <span key={field}>
                <b>{CHANGE_FIELD_LABELS[field] ?? field}</b>
                <span>
                  {formatComparisonValue(change.from)} → {formatComparisonValue(change.to)}
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="changeTooltipMuted">
            {changeType === "NEW"
              ? "No previous row"
              : changeType === "CLOSED"
                ? "Not present in current report table"
                : "No field changes"}
          </span>
        )}
        {comparison.previousFlexStatus || comparison.previousRtplStatus || comparison.previousWipAging ? (
          <span className="changeTooltipPrevious">
            Prev Flex: {formatComparisonValue(comparison.previousFlexStatus)}
            {" · "}
            Prev RTPL: {formatComparisonValue(comparison.previousRtplStatus)}
            {" · "}
            Prev WIP: {formatComparisonValue(comparison.previousWipAging)}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function CarryForwardBadge({
  carryForward,
}: Readonly<{
  carryForward: GeneratedReportResponse["rows"][number]["carryForward"];
}>) {
  if (carryForward.closedSyntheticRow) {
    return (
      <span
        className="opsBadge closed"
        title="Closed work order carried from the previous final report"
      >
        Closed
      </span>
    );
  }

  if (carryForward.carriedForwardFields.length > 0) {
    return (
      <span
        className="opsBadge carried"
        title={`Value carried from previous day: ${formatFieldList(carryForward.carriedForwardFields)}`}
      >
        Carried
      </span>
    );
  }

  if (carryForward.changeType === "NEW_WORK_ORDER") {
    return (
      <span
        className="opsBadge new"
        title="New work order; manual fields must be completed today"
      >
        New WO
      </span>
    );
  }

  if (carryForward.manualFieldsMissing.length > 0) {
    return (
      <span
        className="opsBadge manual"
        title={`Manual entry required: ${formatFieldList(carryForward.manualFieldsMissing)}`}
      >
        Manual
      </span>
    );
  }

  return (
    <span className="opsBadge complete" title="Manual fields are complete">
      Complete
    </span>
  );
}

function CarryForwardSummaryPanel({
  report,
}: Readonly<{
  report: GeneratedReportResponse;
}>) {
  return (
    <div className="carryForwardPanel">
      <div className="comparisonPanelHeader">
        <div>
          <h3>Manual Field Carry-Forward</h3>
          <p>Uses the previous final human-edited report for this region.</p>
        </div>
        <StatusPill tone={report.carryForward.totalFieldsCarried > 0 ? "good" : "neutral"}>
          {report.carryForward.totalFieldsCarried > 0 ? "Applied" : "No carried fields"}
        </StatusPill>
      </div>
      <div className="comparisonMetricGrid">
        <Metric label="Fields Carried" value={report.carryForward.totalFieldsCarried} />
        <Metric label="Rows Auto Completed" value={report.carryForward.rowsAutoCompleted} />
        <Metric label="Rows Still Manual" value={report.carryForward.rowsStillManual} />
        <Metric
          label="Closed Rows"
          value={report.rows.filter((row) => row.carryForward.closedSyntheticRow).length}
        />
      </div>
    </div>
  );
}

function ComparisonSummaryPanel({
  report,
}: Readonly<{
  report: GeneratedReportResponse;
}>) {
  if (report.comparison.skipped || !report.comparison.summary) {
    return (
      <div className="comparisonPanel skipped">
        <div>
          <h3>Day-over-Day Comparison</h3>
          <p>No previous-day final report was available for this region.</p>
        </div>
        <StatusPill tone="neutral">Skipped</StatusPill>
      </div>
    );
  }

  const summary = report.comparison.summary;

  return (
    <div className="comparisonPanel">
      <div className="comparisonPanelHeader">
        <div>
          <h3>Day-over-Day Comparison</h3>
          <p>Compared with session {report.comparison.previousSessionId}</p>
        </div>
        <StatusPill tone="good">Compared</StatusPill>
      </div>
      <div className="comparisonMetricGrid">
        <Metric label="New" value={summary.new_count} />
        <Metric label="Closed" value={summary.closed_count} />
        <Metric label="Updated" value={summary.updated_count} />
        <Metric label="Carried" value={summary.carried_count} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [regionId, setRegionId] = useState("");
  const [files, setFiles] = useState<Partial<Record<FileField, File>>>({});
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [preview, setPreview] = useState<MatchPreviewResponse | null>(null);
  const [report, setReport] = useState<GeneratedReportResponse | null>(null);
  const [editingSerialNo, setEditingSerialNo] = useState<number | null>(null);
  const [savingSerialNo, setSavingSerialNo] = useState<number | null>(null);
   const [draftOutput, setDraftOutput] = useState<Record<string, string | number>>({});
   const draftOutputRef = useRef(draftOutput);
   draftOutputRef.current = draftOutput;
  const [reportDate, setReportDate] = useState(todayIsoDate());
  const [dbHealth, setDbHealth] = useState<DatabaseHealthResponse | null>(null);
  const [runtimeHealth, setRuntimeHealth] =
    useState<RuntimeHealthResponse | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPreviewCategory, setSelectedPreviewCategory] = useState<string | null>(null);

  const [historySessions, setHistorySessions] = useState<ReportHistorySession[]>([]);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedWoOtcCode, setSelectedWoOtcCode] = useState<string | null>(null);
  const [selectedRtplRegion, setSelectedRtplRegion] = useState<string>(ALL_REGIONS_FILTER);
  const [showCissOnly, setShowCissOnly] = useState(false);

  useEffect(() => {
    setSelectedRegion(null);
    setSelectedWoOtcCode(null);
    setSelectedRtplRegion(ALL_REGIONS_FILTER);
    setShowCissOnly(false);
  }, [report?.reportId]);

  const cissRows = useMemo(() => {
    if (!report) return [];
    return report.rows.filter(isCissCase);
  }, [report]);

  const tableBaseRows = useMemo(() => {
    if (!report) return [];
    return showCissOnly ? cissRows : report.rows;
  }, [cissRows, report, showCissOnly]);

  const regionFilteredRows = useMemo(() => {
    if (!report) return [];
    
    return tableBaseRows.filter((row) => {
      const matchRegion = selectedRegion === "ALL" || !selectedRegion || row.output["Work Location"] === selectedRegion;
      const matchCode = !selectedWoOtcCode || row.output["WO OTC CODE"] === selectedWoOtcCode;
      return matchRegion && matchCode;
    });
  }, [report, selectedRegion, selectedWoOtcCode, tableBaseRows]);

  // Column-filter hook: operates on rows already filtered by region/WO OTC
  const colFilters = useColumnFilters(regionFilteredRows);

  // Reset column filters when the report changes
  const reportId = report?.reportId;
  useEffect(() => {
    colFilters.resetAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  // Final visible rows: region-filtered → column-filtered
  const filteredRows = useMemo(
    () => colFilters.filteredRows(regionFilteredRows),
    [colFilters, regionFilteredRows],
  );

  const overallWoOtcBreakdown = useMemo(() => {
    if (!report) return [];
    return buildOverallWoOtcBreakdown(report.regionBreakdown);
  }, [report]);

  const rtplRegionOptions = useMemo(() => {
    if (!report) return [];

    return [
      { value: ALL_REGIONS_FILTER, label: "All", count: report.rows.length },
      ...report.regionBreakdown.map((entry) => ({
        value: entry.aspCode,
        label: entry.regionName,
        count: entry.count,
      })),
    ];
  }, [report]);

  const rtplAnalyticsRows = useMemo(() => {
    if (!report) return [];
    return filterRowsByRegion(report.rows, selectedRtplRegion);
  }, [report, selectedRtplRegion]);

  const rtplStatusMetrics = useMemo(
    () => buildRtplOperationalAnalytics(rtplAnalyticsRows),
    [rtplAnalyticsRows],
  );

  const selectedRecords = useMemo(() => {
    if (!preview || !selectedPreviewCategory) return null;
    const { enrichedRows } = preview;
    switch (selectedPreviewCategory) {
      case "Renderways":
        return enrichedRows;
      case "Flex matched":
        return enrichedRows.filter(
          (r) => r.match_status === "MATCHED" || r.match_status === "CALLPLAN_MISSING",
        );
      case "Call Plan matched":
        return enrichedRows.filter(
          (r) => r.match_status === "MATCHED" || r.match_status === "FLEX_MISSING",
        );
      case "Flex missing":
        return enrichedRows.filter(
          (r) => r.match_status === "FLEX_MISSING" || r.match_status === "BOTH_MISSING",
        );
      case "Call Plan missing":
        return enrichedRows.filter(
          (r) => r.match_status === "CALLPLAN_MISSING" || r.match_status === "BOTH_MISSING",
        );
      default:
        return null;
    }
  }, [preview, selectedPreviewCategory]);

  const batchIds = useMemo(() => {
    const batches = upload?.batches ?? [];

    return {
      flexUploadBatchId: batchIdBySource(batches, "FLEX_WIP"),
      renderwaysUploadBatchId: batchIdBySource(batches, "RENDERWAYS"),
      callPlanUploadBatchId: batchIdBySource(batches, "CALL_PLAN"),
    };
  }, [upload]);

  async function refreshHealth() {
    const [database, runtime] = await Promise.allSettled([
      getDatabaseHealth(),
      getRuntimeHealth(),
    ]);

    if (database.status === "fulfilled") {
      setDbHealth(database.value);
    }

    if (runtime.status === "fulfilled") {
      setRuntimeHealth(runtime.value);
    }
  }

  useEffect(() => {
    const token = window.localStorage.getItem("opencall.token");
    const user = window.localStorage.getItem("opencall.user");

    if (token && user) {
      setSession({
        token,
        user: JSON.parse(user) as LoginResponse["user"],
      });
    }

    void refreshHealth();
  }, []);

  useEffect(() => {
    if (session) {
      getReportHistory(session.token).then(setHistorySessions).catch((error) => {
        if (error instanceof Error && (error.message.includes("expired") || error.message.includes("Invalid bearer") || error.message.includes("unauthorized") || error.message.includes("failed 401"))) {
          handleLogout();
          setMessage("Session expired, please login again.");
        } else {
          console.error(error);
        }
      });
    } else {
      setHistorySessions([]);
    }
  }, [session]);

  async function runAction(action: () => Promise<void>) {
    setIsBusy(true);
    setMessage(null);

    try {
      await action();
    } catch (error) {
      if (error instanceof Error && (error.message.includes("expired") || error.message.includes("Invalid bearer") || error.message.includes("unauthorized") || error.message.includes("failed 401"))) {
        handleLogout();
        setMessage("Session expired, please login again.");
      } else {
        setMessage(error instanceof Error ? error.message : "Operation failed");
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const nextSession = await login(email);
      window.localStorage.setItem("opencall.token", nextSession.token);
      window.localStorage.setItem("opencall.user", JSON.stringify(nextSession.user));
      setSession(nextSession);
      setRegionId(nextSession.user.regionId ?? "");
    });
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      setMessage("Login required");
      return;
    }

    const flexWipReport = files.flexWipReport;
    const renderwaysReport = files.renderwaysReport;
    const callPlan = files.callPlan;

    if (!flexWipReport) {
      setMessage("Flex WIP Report is required before processing");
      return;
    }

    await runAction(async () => {
      const result = await uploadReports({
        token: session.token,
        regionId,
        flexWipReport,
        ...(renderwaysReport ? { renderwaysReport } : {}),
        ...(callPlan ? { callPlan } : {}),
      });
      setUpload(result);
      setPreview(null);
      setReport(null);
      setEditingSerialNo(null);
      setSavingSerialNo(null);
      setDraftOutput({});
      
      // Refresh history to get the draft
      getReportHistory(session.token).then(setHistorySessions).catch(console.error);
    });
  }

  async function handlePreview() {
    if (!session) {
      setMessage("Login required");
      return;
    }

    await runAction(async () => {
      setPreview(
        await previewMatches({
          token: session.token,
          regionId,
          ...batchIds,
        }),
      );
      setSelectedPreviewCategory(null);
    });
  }

  async function handleGenerate() {
    if (!session) {
      setMessage("Login required");
      return;
    }

    await runAction(async () => {
      setReport(
        await generateReport({
          token: session.token,
          regionId,
          reportDate,
          ...batchIds,
        }),
      );
      setEditingSerialNo(null);
      setSavingSerialNo(null);
      setDraftOutput({});
      
      // Refresh history to see completed status
      getReportHistory(session.token).then(setHistorySessions).catch(console.error);
    });
  }

  function handleLogout() {
    window.localStorage.removeItem("opencall.token");
    window.localStorage.removeItem("opencall.user");
    setSession(null);
    setUpload(null);
    setPreview(null);
    setReport(null);
    setEditingSerialNo(null);
    setSavingSerialNo(null);
    setDraftOutput({});
    setSelectedPreviewCategory(null);
  }

  async function handleHistoryOpen(historySession: ReportHistorySession) {
    if (!session) return;
    await runAction(async () => {
      const detail = await getReportHistoryById(session.token, historySession.id);
      
      // Create mock batch objects so frontend can use batchIds
      const mockBatches: UploadBatch[] = [];
      if (detail.flexUploadBatchId) {
        mockBatches.push({ id: detail.flexUploadBatchId, sourceType: "FLEX_WIP", originalFileName: "", status: "PROCESSED", rowCount: 0, errorCount: 0, createdAt: detail.createdAt });
      }
      if (detail.renderwaysUploadBatchId) {
        mockBatches.push({ id: detail.renderwaysUploadBatchId, sourceType: "RENDERWAYS", originalFileName: "", status: "PROCESSED", rowCount: 0, errorCount: 0, createdAt: detail.createdAt });
      }
      if (detail.callPlanUploadBatchId) {
        mockBatches.push({ id: detail.callPlanUploadBatchId, sourceType: "CALL_PLAN", originalFileName: "", status: "PROCESSED", rowCount: 0, errorCount: 0, createdAt: detail.createdAt });
      }
      
      // We restore the state. If it's DRAFT, we only have the batches.
      // We can trigger a preview automatically.
      setUpload({ batches: mockBatches, validations: [], parseSummaries: [] });
      setPreview(null);
      setReport(null);
      setEditingSerialNo(null);
      setSavingSerialNo(null);
      setDraftOutput({});
      setFiles({});
      if (detail.regionId) setRegionId(detail.regionId);
      
      // Fetch preview and report if applicable
      const prev = await previewMatches({
        token: session.token,
        regionId: detail.regionId || regionId,
        flexUploadBatchId: detail.flexUploadBatchId!,
        ...(detail.renderwaysUploadBatchId ? { renderwaysUploadBatchId: detail.renderwaysUploadBatchId } : {}),
        ...(detail.callPlanUploadBatchId ? { callPlanUploadBatchId: detail.callPlanUploadBatchId } : {}),
      });
      setPreview(prev);

      // If it's completed, we could ideally fetch the report.
      // But since we don't have a getReport API, we'll just re-generate it to restore view
      if (detail.status === "COMPLETED") {
         const rep = await generateReport({
           token: session.token,
           regionId: detail.regionId || regionId,
           reportDate: detail.createdAt.slice(0, 10),
           flexUploadBatchId: detail.flexUploadBatchId!,
           ...(detail.renderwaysUploadBatchId ? { renderwaysUploadBatchId: detail.renderwaysUploadBatchId } : {}),
           ...(detail.callPlanUploadBatchId ? { callPlanUploadBatchId: detail.callPlanUploadBatchId } : {}),
         });
         setReport(rep);
      }
      
      if (window.innerWidth < 768) {
        setIsHistoryPanelOpen(false);
      }
    });
  }

  async function handleHistoryRename(historySession: ReportHistorySession, newTitle: string) {
    if (!session) return;
    await renameReportHistory(session.token, historySession.id, newTitle).catch(console.error);
    getReportHistory(session.token).then(setHistorySessions).catch(console.error);
  }



  async function handleHistoryDelete(historySession: ReportHistorySession) {
    if (!session) return;
    if (!window.confirm("Are you sure you want to delete this session?")) return;
    await deleteReportHistory(session.token, historySession.id).catch(console.error);
    getReportHistory(session.token).then(setHistorySessions).catch(console.error);
  }

  const canUseBatches = Boolean(batchIds.flexUploadBatchId);
  const incompleteCellCount = useMemo(() => {
    return report?.rows.reduce((count, row) => {
      const outputMissingCount = Object.values(row.output).filter(
        (value) => value === MANUAL_ENTRY_REQUIRED,
      ).length;
      return count + Math.max(outputMissingCount, row.carryForward.manualFieldsMissing.length);
    }, 0) ?? 0;
  }, [report]);

  function startEditing(row: GeneratedReportResponse["rows"][number]) {
    setEditingSerialNo(row.serialNo);
    setDraftOutput({ ...row.output });
  }

  function cancelEditing() {
    setEditingSerialNo(null);
    setDraftOutput({});
  }

  function patchValue(column: string): string | null {
    const value = String(draftOutputRef.current[column] ?? "").trim();
    return value && value !== MANUAL_ENTRY_REQUIRED ? value : null;
  }

  function buildReportRowPatchValues(
    row: GeneratedReportResponse["rows"][number],
  ): ReportRowPatchValues {
    const values: ReportRowPatchValues = {};

    for (const [column, apiField] of Object.entries(EDITABLE_COLUMN_API_FIELD)) {
      if (!apiField) {
        continue;
      }

      const draftValue = patchValue(column);
      const currentValue = String(row.output[column] ?? "").trim();
      const normalizedCurrent =
        currentValue && currentValue !== MANUAL_ENTRY_REQUIRED ? currentValue : null;

      if (draftValue === null || draftValue === normalizedCurrent) {
        continue;
      }

      values[apiField as keyof ReportRowPatchValues] = draftValue;
    }

    return values;
  }

  function outputFromPersistedRow(
    output: Record<string, string | number>,
    persisted: EditedReportRowResponse,
  ): Record<string, string | number> {
    const nextOutput = { ...output };

    for (const [column, responseField] of Object.entries(EDITED_RESPONSE_COLUMN)) {
      if (!responseField) {
        continue;
      }

      const value = persisted[responseField];
      nextOutput[column] =
        typeof value === "string" && value.trim().length > 0
          ? value
          : MANUAL_ENTRY_REQUIRED;
    }

    return nextOutput;
  }

  async function saveEditing(serialNo: number) {
    if (!session) {
      setMessage("Login required");
      return;
    }

    const currentReport = report;
    const row = currentReport?.rows.find((candidate) => candidate.serialNo === serialNo);

    if (!currentReport || !row) {
      return;
    }

    if (!row.id) {
      setMessage("Save failed: this row has not been persisted yet. Regenerate the report and try again.");
      return;
    }

    setSavingSerialNo(serialNo);
    setMessage(null);

    try {
      const values = buildReportRowPatchValues(row);

      if (Object.keys(values).length === 0) {
        cancelEditing();
        return;
      }

      const persisted = await updateReportRow({
        token: session.token,
        rowId: row.id,
        values,
      });
      const editedApiFields = new Set(Object.keys(values));

      setReport((latestReport) => {
        if (!latestReport) {
          return latestReport;
        }

        return {
          ...latestReport,
          rows: latestReport.rows.map((latestRow) =>
            latestRow.serialNo === serialNo
              ? {
                  ...latestRow,
                  output: outputFromPersistedRow(
                    { ...draftOutputRef.current, "S.no": latestRow.serialNo },
                    persisted,
                  ),
                  carryForward: {
                    ...latestRow.carryForward,
                    carriedForwardFields:
                      persisted.carriedForwardFields ??
                      latestRow.carryForward.carriedForwardFields.filter((field) => {
                        const column = Object.entries(MANUAL_FIELD_BY_COLUMN).find(
                          ([, manualField]) => manualField === field,
                        )?.[0];
                        const apiField = column ? EDITABLE_COLUMN_API_FIELD[column] : null;
                        return apiField ? !editedApiFields.has(apiField) : true;
                      }),
                    manualFieldsCompleted: persisted.manualFieldsCompleted,
                    manualFieldsMissing: persisted.manualFieldsMissing,
                  },
                  updatedAt: persisted.updatedAt,
                  updatedBy: persisted.updatedBy,
                  rowEditable: persisted.rowEditable,
                  carryForwardSource: persisted.carryForwardSource,
                }
              : latestRow,
          ),
        };
      });
      cancelEditing();
      setMessage("Row saved.");
    } catch (error) {
      setReport(currentReport);
      setMessage(error instanceof Error ? `Save failed: ${error.message}` : "Save failed");
    } finally {
      setSavingSerialNo(null);
    }
  }

  function exportReport(download: (report: GeneratedReportResponse) => void) {
    if (!report) {
      return;
    }

    if (
      incompleteCellCount > 0 &&
      !window.confirm(
        `${incompleteCellCount} field(s) still require manual entry. Export anyway?`,
      )
    ) {
      setMessage("Export paused: complete highlighted manual-entry fields first.");
      return;
    }

    const isRtplRegionFiltered = selectedRtplRegion !== ALL_REGIONS_FILTER;
    const hasExistingExportFilter = Boolean(selectedRegion || selectedWoOtcCode);
    const hasColumnFilter = colFilters.activeFilterCount > 0;
    const hasCissFilter = showCissOnly;
    const exportRows = isRtplRegionFiltered
      ? rtplAnalyticsRows
      : (hasExistingExportFilter || hasColumnFilter || hasCissFilter)
        ? filteredRows
        : null;

    download(exportRows ? reportWithRows(report, exportRows) : report);
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <p className="eyebrow">OpenCall</p>
          <h1>Daily Call Plan</h1>
        </div>
        <div className="topActions">
          <StatusPill tone={dbHealth?.connected ? "good" : "bad"}>
            DB {dbHealth?.status ?? "checking"}
          </StatusPill>
          <StatusPill tone={runtimeHealth?.ok ? "good" : "bad"}>
            Runtime {runtimeHealth?.status ?? "checking"}
          </StatusPill>
          <button className="iconButton" type="button" onClick={() => void refreshHealth()}>
            Refresh
          </button>
          {session && (
            <button className="iconButton" type="button" onClick={() => setIsHistoryPanelOpen(!isHistoryPanelOpen)}>
              {isHistoryPanelOpen ? "Close History" : "History"}
            </button>
          )}
        </div>
      </header>

      {message ? <div className="alert">{message}</div> : null}

      <section className={`workspace ${session && isHistoryPanelOpen ? "withHistory" : ""}`}>
        <aside className="sidebar">
          <form className="panel" onSubmit={(event) => void handleLogin(event)}>
            <h2>Access</h2>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
              />
            </label>
            <button type="submit" disabled={isBusy || !email.trim()}>
              Login
            </button>
            {session ? (
              <div className="sessionBox">
                <strong>{session.user.email}</strong>
                <span>{session.user.role}</span>
                <button type="button" className="secondaryButton" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            ) : null}
          </form>

          <div className="panel">
            <h2>Scope</h2>
            <label>
              Region ID
              <input
                value={regionId}
                onChange={(event) => setRegionId(event.target.value)}
                placeholder="Optional for SUPER_ADMIN"
              />
            </label>
            <label>
              Report Date
              <input
                type="date"
                value={reportDate}
                onChange={(event) => setReportDate(event.target.value)}
              />
            </label>
          </div>

          {session && isHistoryPanelOpen && (
            <ReportHistoryPanel 
              sessions={historySessions}
              onOpen={handleHistoryOpen}
              onRename={handleHistoryRename}
              onDelete={handleHistoryDelete}
            />
          )}
        </aside>

        <section className="mainGrid">
          <form className="panel uploadPanel" onSubmit={(event) => void handleUpload(event)}>
            <div className="sectionHeader">
              <h2>Source Files</h2>
              <button type="submit" disabled={isBusy || !session}>
                Upload
              </button>
            </div>
            <div className="fileGrid">
              {FILE_FIELDS.map((item) => (
                <label className="fileDrop" key={item.field}>
                  <span>
                    {item.label}{" "}
                    <em className={item.required ? "requiredTag" : undefined}>
                      {item.required ? "Required" : "Optional"}
                    </em>
                  </span>
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      setFiles((current) => ({
                        ...current,
                        [item.field]: file,
                      }));
                    }}
                  />
                  <strong>
                    {files[item.field]?.name ??
                      (item.required ? "Required file not selected" : "Optional")}
                  </strong>
                </label>
              ))}
            </div>
          </form>

          {upload ? (
            <section className="panel">
              <div className="sectionHeader">
                <h2>Upload Batches</h2>
                <button type="button" disabled={isBusy || !canUseBatches} onClick={() => void handlePreview()}>
                  Preview Matches
                </button>
              </div>
              <div className="batchGrid">
                {upload.batches.map((batch) => {
                  const validation = upload.validations.find((v) => v.sourceType === batch.sourceType);
                  const hasMissingColumns = validation && !validation.isValid && validation.missingColumns.length > 0;
                  return (
                    <div className="batchCard" key={batch.id}>
                      <span>{SOURCE_LABELS[batch.sourceType]}</span>
                      <strong>{batch.rowCount} rows</strong>
                      <code>{batch.id}</code>
                      <StatusPill tone={batch.errorCount === 0 && !hasMissingColumns ? "good" : "warn"}>
                        {batch.status}
                      </StatusPill>
                      {hasMissingColumns && (
                        <div style={{ color: "var(--danger)", fontSize: "11px", fontWeight: "bold", marginTop: "4px" }}>
                          Missing columns: {validation.missingColumns.join(", ")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {preview ? (
            <section className="panel">
              <div className="sectionHeader">
                <h2>Match Preview</h2>
                <button type="button" disabled={isBusy || !canUseBatches} onClick={() => void handleGenerate()}>
                  Generate Report
                </button>
              </div>
              <div className="metricGrid">
                <Metric
                  label="Flex WIP rows"
                  value={preview.totalFlexRows ?? 0}
                  onClick={() =>
                    setSelectedPreviewCategory(
                      selectedPreviewCategory === "Renderways" ? null : "Renderways"
                    )
                  }
                  isActive={selectedPreviewCategory === "Renderways"}
                />
                <Metric
                  label="Flex matched"
                  value={preview.flexMatchedRows}
                  onClick={() =>
                    setSelectedPreviewCategory(
                      selectedPreviewCategory === "Flex matched" ? null : "Flex matched"
                    )
                  }
                  isActive={selectedPreviewCategory === "Flex matched"}
                />
                <Metric
                  label="Call Plan matched"
                  value={preview.callPlanMatchedRows}
                  onClick={() =>
                    setSelectedPreviewCategory(
                      selectedPreviewCategory === "Call Plan matched" ? null : "Call Plan matched"
                    )
                  }
                  isActive={selectedPreviewCategory === "Call Plan matched"}
                />
                <Metric
                  label="Flex missing"
                  value={preview.unmatchedFlexRows}
                  onClick={() =>
                    setSelectedPreviewCategory(
                      selectedPreviewCategory === "Flex missing" ? null : "Flex missing"
                    )
                  }
                  isActive={selectedPreviewCategory === "Flex missing"}
                />
                <Metric
                  label="Call Plan missing"
                  value={preview.unmatchedCallPlanRows}
                  onClick={() =>
                    setSelectedPreviewCategory(
                      selectedPreviewCategory === "Call Plan missing" ? null : "Call Plan missing"
                    )
                  }
                  isActive={selectedPreviewCategory === "Call Plan missing"}
                />
              </div>
              {selectedPreviewCategory && selectedRecords && selectedRecords.length > 0 && (
                <div style={{ marginTop: "16px", minWidth: 0 }}>
                  <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>
                    {selectedPreviewCategory} Records
                  </h3>
                  <div className="tableWrap" style={{ maxHeight: "400px" }}>
                    <table>
                      <thead>
                        <tr>
                          {Object.keys(selectedRecords[0] ?? {}).map((key) => (
                            <th key={key}>{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRecords.map((row, i) => (
                          <tr key={i}>
                            {Object.values(row).map((val, j) => (
                              <td key={j}>{String(val ?? "")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {report ? (
            <section className="panel reportPanel">
              <div className="sectionHeader">
                <div>
                  <h2>Generated Report</h2>
                  <p>{report.reportId}</p>
                </div>
                <div className="reportStats">
                  <Metric label="Total Calls" value={report.totalRows} />
                  <Metric
                    label="CISS Cases"
                    value={cissRows.length}
                    onClick={() => setShowCissOnly((current) => !current)}
                    isActive={showCissOnly}
                  />
                  <Metric label="Duplicates" value={report.duplicateTicketCount} />
                  <Metric label="Manual Required" value={incompleteCellCount} />
                </div>
              </div>
              {incompleteCellCount > 0 ? (
                <p className="hint">
                  Click any highlighted "Manual Entry Required" cell or the row Edit button to enter manual data.
                </p>
              ) : null}
              <CarryForwardSummaryPanel report={report} />
              <ComparisonSummaryPanel report={report} />

              <div className="regionBreakdownSection">
                <div className="sectionHeader">
                  <h3>Region-wise Breakdown</h3>
                  {selectedRegion && (
                    <button 
                      className="secondaryButton" 
                      onClick={() => {
                        setSelectedRegion(null);
                        setSelectedWoOtcCode(null);
                      }}
                      style={{ minHeight: '32px', padding: '0 12px', fontSize: '12px' }}
                    >
                      Show All Regions
                    </button>
                  )}
                </div>
                <div className="regionGrid">
                  <div 
                    className={`regionMetric ${selectedRegion === "ALL" && !selectedWoOtcCode ? "active" : ""}`}
                    onClick={() => {
                      if (selectedRegion === "ALL" && !selectedWoOtcCode) {
                        setSelectedRegion(null);
                      } else {
                        setSelectedRegion("ALL");
                        setSelectedWoOtcCode(null);
                      }
                    }}
                    style={{ cursor: "pointer", border: "2px solid var(--accent)", background: "rgba(18, 143, 143, 0.05)" }}
                  >
                    <div className="regionMetricHeader">
                        <div className="regionMetricValue">{report.rows.length}</div>
                      <div className="regionMetricLabel">ALL REGIONS</div>
                      <div className="regionMetricSubtext">GLOBAL</div>
                    </div>
                    
                    {overallWoOtcBreakdown.length > 0 && (
                      <div className="regionWoOtcList">
                        {overallWoOtcBreakdown.map(woCode => (
                          <div 
                            key={woCode.code}
                            className={`regionWoOtcItem ${(selectedRegion === "ALL" || !selectedRegion) && selectedWoOtcCode === woCode.code ? "active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if ((selectedRegion === "ALL" || !selectedRegion) && selectedWoOtcCode === woCode.code) {
                                setSelectedWoOtcCode(null);
                                setSelectedRegion(null);
                              } else {
                                setSelectedRegion("ALL");
                                setSelectedWoOtcCode(woCode.code);
                              }
                            }}
                          >
                            <span className="regionWoOtcCode">{woCode.code}</span>
                            <span className="regionWoOtcCount">{woCode.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {report.regionBreakdown.map((entry) => (
                    <div 
                      key={entry.aspCode} 
                      className={`regionMetric ${selectedRegion === entry.aspCode && !selectedWoOtcCode ? "active" : ""}`}
                      onClick={() => {
                        if (selectedRegion === entry.aspCode && !selectedWoOtcCode) {
                          setSelectedRegion(null);
                        } else {
                          setSelectedRegion(entry.aspCode);
                          setSelectedWoOtcCode(null);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="regionMetricHeader">
                        <div className="regionMetricValue">{entry.count}</div>
                        <div className="regionMetricLabel">{entry.regionName}</div>
                        <div className="regionMetricSubtext">{entry.aspCode}</div>
                      </div>
                      
                      {entry.woOtcCodeBreakdown && entry.woOtcCodeBreakdown.length > 0 && (
                        <div className="regionWoOtcList">
                          {entry.woOtcCodeBreakdown.map(woCode => (
                            <div 
                              key={woCode.code}
                              className={`regionWoOtcItem ${selectedRegion === entry.aspCode && selectedWoOtcCode === woCode.code ? "active" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (selectedRegion === entry.aspCode && selectedWoOtcCode === woCode.code) {
                                  // Deselect WO code, but keep region selected
                                  setSelectedWoOtcCode(null);
                                } else {
                                  setSelectedRegion(entry.aspCode);
                                  setSelectedWoOtcCode(woCode.code);
                                }
                              }}
                            >
                              <span className="regionWoOtcCode">{woCode.code}</span>
                              <span className="regionWoOtcCount">{woCode.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rtplAnalyticsSection">
                <div className="sectionHeader rtplAnalyticsHeader">
                  <div>
                    <h3>RTPL Operational Analytics</h3>
                  </div>
                  <span className="statusBadge neutral">
                    {rtplAnalyticsRows.length} rows
                  </span>
                </div>

                <div className="regionFilterTabs" aria-label="RTPL analytics region filter">
                  {rtplRegionOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`regionFilterTab ${selectedRtplRegion === option.value ? "active" : ""}`}
                      onClick={() => setSelectedRtplRegion(option.value)}
                    >
                      <span>{option.label}</span>
                      <strong>{option.count}</strong>
                    </button>
                  ))}
                </div>

                {rtplStatusMetrics.length > 0 ? (
                  <div className="rtplMetricGrid">
                    {rtplStatusMetrics.map((metric) => (
                      <div className="rtplMetricCard" key={metric.status}>
                        <span>{metric.status}</span>
                        <strong>{metric.count}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rtplEmptyState">
                    No RTPL statuses for the selected region.
                  </div>
                )}
              </div>

              <div className="downloadActions">
                <button
                  className="downloadBtn excelBtn"
                  onClick={() => exportReport(downloadReportAsXlsx)}
                >
                  Download Excel (.xlsx)
                </button>
                <button
                  className="downloadBtn csvBtn"
                  onClick={() => exportReport(downloadReportAsExcel)}
                >
                  Download CSV
                </button>
              </div>
              {colFilters.activeFilterCount > 0 && (
                <div className="colFilterSummary">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M1 2h14l-5.5 6.5V14l-3-1.5V8.5L1 2z" fill="currentColor" />
                  </svg>
                  <span>
                    {colFilters.activeFilterCount} column filter{colFilters.activeFilterCount > 1 ? "s" : ""} active
                    {" · "}
                    {filteredRows.length} of {regionFilteredRows.length} rows shown
                  </span>
                  <button type="button" onClick={colFilters.resetAll}>Clear All Filters</button>
                </div>
              )}
              {showCissOnly && (
                <div className="colFilterSummary">
                  <span>
                    CISS Cases active
                    {" · "}
                    {filteredRows.length} of {regionFilteredRows.length} rows shown
                  </span>
                  <button type="button" onClick={() => setShowCissOnly(false)}>Show All Cases</button>
                </div>
              )}
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Change</th>
                      <th>Ops</th>
                      {DAILY_CALL_PLAN_COLUMNS.map((column) => {
                        const isFilterable = colFilters.isFilterable(column);
                        const isFiltered = colFilters.isColumnFiltered(column);
                        const uniqueVals = colFilters.uniqueValuesMap.get(column) ?? [];

                        return (
                          <th key={column}>
                            {column}
                            {isFilterable && (
                              <ColumnFilterDropdown
                                column={column}
                                isOpen={colFilters.openColumn === column}
                                uniqueValues={uniqueVals}
                                selectedValues={colFilters.filters[column]}
                                isFiltered={isFiltered}
                                onToggleValue={colFilters.toggleValue}
                                onSelectAll={colFilters.selectAll}
                                onClearAll={colFilters.clearAll}
                                onApply={colFilters.setColumnFilter}
                                onOpen={colFilters.openFilterDropdown}
                                onClose={colFilters.closeFilterDropdown}
                              />
                            )}
                          </th>
                        );
                      })}
                      <th className="stickyActionColumn">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const isEditing = editingSerialNo === row.serialNo;

                      return (
                        <tr
                          key={row.serialNo}
                          className={
                            Object.values(row.output).includes(MANUAL_ENTRY_REQUIRED) ||
                            row.carryForward.manualFieldsMissing.length > 0
                              ? "incompleteRow"
                              : undefined
                          }
                        >
                          <td className="changeCell">
                            <ChangeTypeBadge comparison={row.comparison} />
                          </td>
                          <td className="opsCell">
                            <CarryForwardBadge carryForward={row.carryForward} />
                            {row.carryForward.manualFieldsMissing.length > 0 ? (
                              <span
                                className="manualCount"
                                title={`Manual entry required: ${formatFieldList(row.carryForward.manualFieldsMissing)}`}
                              >
                                {row.carryForward.manualFieldsMissing.length}
                              </span>
                            ) : null}
                          </td>
                          {DAILY_CALL_PLAN_COLUMNS.map((column) => {
                            const value = isEditing ? draftOutput[column] : row.output[column];
                            const isManualRequired = value === MANUAL_ENTRY_REQUIRED;
                            const isReadOnly = column === "S.no" || column === "Ticket ID";
                            const manualField = MANUAL_FIELD_BY_COLUMN[column];
                            const isCarriedForward =
                              manualField
                                ? row.carryForward.carriedForwardFields.includes(manualField)
                                : false;
                            const needsManualEntry =
                              manualField
                                ? row.carryForward.manualFieldsMissing.includes(manualField)
                                : false;

                            return (
                              <td
                                key={column}
                                className={[
                                  isManualRequired || needsManualEntry ? "missingCell" : "",
                                  isCarriedForward ? "carriedForwardCell" : "",
                                ].filter(Boolean).join(" ") || undefined}
                                onClick={
                                  !isEditing && isManualRequired && !isReadOnly
                                    ? () => startEditing(row)
                                    : undefined
                                }
                                style={
                                  !isEditing && isManualRequired && !isReadOnly
                                    ? { cursor: "pointer" }
                                    : undefined
                                }
                                title={
                                  !isEditing && isManualRequired && !isReadOnly
                                    ? "Click to edit manual entry"
                                    : isCarriedForward
                                      ? "Value carried from previous day"
                                      : undefined
                                }
                              >
                                {isEditing && !isReadOnly ? (
                                  column === "RTPL status" ? (
                                    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                                         <select
                                           className="cellInput"
                                           value={
                                             draftOutput[column]
                                               ? RTPL_STATUS_OPTIONS.some((opt) => opt === String(draftOutput[column]))
                                                 ? String(draftOutput[column])
                                                 : "Custom"
                                               : ""
                                           }
                                           onChange={(event) => {
                                             const selected = event.target.value;
                                             if (selected === "Custom") {
                                               setDraftOutput((current) => ({
                                                 ...current,
                                                 [column]: "",
                                               }));
                                             } else {
                                               setDraftOutput((current) => ({
                                                 ...current,
                                                 [column]: selected || "",
                                               }));
                                             }
                                           }}
                                         >
                                        <option value="">{MANUAL_ENTRY_REQUIRED}</option>
                                        {RTPL_STATUS_OPTIONS.map((option) => (
                                          <option key={option} value={option}>
                                            {option}
                                          </option>
                                        ))}
                                        <option value="Custom">Custom</option>
                                      </select>
                                       {(draftOutput[column] === "" || !RTPL_STATUS_OPTIONS.some((opt) => opt === String(draftOutput[column]))) && (
                                        <input
                                          className="cellInput"
                                          style={{ flex: 1 }}
                                          value={String(draftOutput[column] ?? "")}
                                          onChange={(event) =>
                                            setDraftOutput((current) => ({
                                              ...current,
                                              [column]: event.target.value,
                                            }))
                                          }
                                          placeholder="Enter custom status"
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    <input
                                      className="cellInput"
                                      value={String(value ?? "")}
                                      onChange={(event) =>
                                        setDraftOutput((current) => ({
                                          ...current,
                                          [column]: event.target.value,
                                        }))
                                      }
                                    />
                                  )
                                ) : (
                                  <span className="cellValueWrap">
                                    <span>{String(value ?? "")}</span>
                                    {isCarriedForward ? (
                                      <span className="cellCarryFlag">Carried</span>
                                    ) : null}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="stickyActionColumn">
                            {isEditing ? (
                              <div className="rowActions">
                                <button
                                  type="button"
                                  disabled={savingSerialNo === row.serialNo}
                                  onClick={() => void saveEditing(row.serialNo)}
                                >
                                  {savingSerialNo === row.serialNo ? "Saving..." : "Save"}
                                </button>
                                <button
                                  type="button"
                                  className="secondaryButton"
                                  disabled={savingSerialNo === row.serialNo}
                                  onClick={cancelEditing}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="secondaryButton"
                                onClick={() => startEditing(row)}
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
}
