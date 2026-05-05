"use client";

import { DAILY_CALL_PLAN_COLUMNS, RTPL_STATUS_OPTIONS } from "@opencall/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  generateReport,
  getDatabaseHealth,
  getRuntimeHealth,
  login,
  previewMatches,
  uploadReports,
  type DatabaseHealthResponse,
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

type SourceKey = "FLEX_WIP" | "RENDERWAYS" | "CALL_PLAN";
type FileField = "flexWipReport" | "renderwaysReport" | "callPlan";

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

export default function DashboardPage() {
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [regionId, setRegionId] = useState("");
  const [files, setFiles] = useState<Partial<Record<FileField, File>>>({});
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [preview, setPreview] = useState<MatchPreviewResponse | null>(null);
  const [report, setReport] = useState<GeneratedReportResponse | null>(null);
  const [editingSerialNo, setEditingSerialNo] = useState<number | null>(null);
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
      return count + Object.values(row.output).filter((value) => value === MANUAL_ENTRY_REQUIRED).length;
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

   function saveEditing(serialNo: number) {
     setReport((current) => {
       if (!current) {
         return current;
       }

       return {
         ...current,
         rows: current.rows.map((row) =>
           row.serialNo === serialNo
             ? { ...row, output: { ...draftOutputRef.current, "S.no": row.serialNo } }
             : row,
         ),
       };
     });
     cancelEditing();
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

    download(report);
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
                  <Metric label="Rows" value={report.totalRows} />
                  <Metric label="Duplicates" value={report.duplicateTicketCount} />
                  <Metric label="Manual Required" value={incompleteCellCount} />
                </div>
              </div>
              {incompleteCellCount > 0 ? (
                <p className="hint">
                  Click any highlighted "Manual Entry Required" cell or the row Edit button to enter manual data.
                </p>
              ) : null}
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
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      {DAILY_CALL_PLAN_COLUMNS.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => {
                      const isEditing = editingSerialNo === row.serialNo;

                      return (
                        <tr
                          key={row.serialNo}
                          className={
                            Object.values(row.output).includes(MANUAL_ENTRY_REQUIRED)
                              ? "incompleteRow"
                              : undefined
                          }
                        >
                          {DAILY_CALL_PLAN_COLUMNS.map((column) => {
                            const value = isEditing ? draftOutput[column] : row.output[column];
                            const isManualRequired = value === MANUAL_ENTRY_REQUIRED;
                            const isReadOnly = column === "S.no" || column === "Ticket ID";

                            return (
                              <td
                                key={column}
                                className={isManualRequired ? "missingCell" : undefined}
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
                                  String(value ?? "")
                                )}
                              </td>
                            );
                          })}
                          <td>
                            {isEditing ? (
                              <div className="rowActions">
                                <button type="button" onClick={() => saveEditing(row.serialNo)}>
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="secondaryButton"
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
