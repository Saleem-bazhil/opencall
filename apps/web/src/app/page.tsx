"use client";

import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import { useEffect, useMemo, useState } from "react";
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
} from "../lib/apiClient";
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
}> = [
  { field: "flexWipReport", source: "FLEX_WIP", label: "Flex WIP Report" },
  { field: "renderwaysReport", source: "RENDERWAYS", label: "Renderways Report" },
  { field: "callPlan", source: "CALL_PLAN", label: "Call Plan" },
];

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
}: Readonly<{
  label: string;
  value: string | number;
}>) {
  return (
    <div className="metric">
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
  const [reportDate, setReportDate] = useState(todayIsoDate());
  const [dbHealth, setDbHealth] = useState<DatabaseHealthResponse | null>(null);
  const [runtimeHealth, setRuntimeHealth] =
    useState<RuntimeHealthResponse | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  async function runAction(action: () => Promise<void>) {
    setIsBusy(true);
    setMessage(null);

    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed");
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

    if (!flexWipReport || !renderwaysReport || !callPlan) {
      setMessage("Select all three Excel files");
      return;
    }

    await runAction(async () => {
      const result = await uploadReports({
        token: session.token,
        regionId,
        flexWipReport,
        renderwaysReport,
        callPlan,
      });
      setUpload(result);
      setPreview(null);
      setReport(null);
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
          ...batchIds,
        }),
      );
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
    });
  }

  function handleLogout() {
    window.localStorage.removeItem("opencall.token");
    window.localStorage.removeItem("opencall.user");
    setSession(null);
    setUpload(null);
    setPreview(null);
    setReport(null);
  }

  const canUseBatches =
    Boolean(batchIds.flexUploadBatchId) &&
    Boolean(batchIds.renderwaysUploadBatchId) &&
    Boolean(batchIds.callPlanUploadBatchId);

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
        </div>
      </header>

      {message ? <div className="alert">{message}</div> : null}

      <section className="workspace">
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
                  <span>{item.label}</span>
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
                  <strong>{files[item.field]?.name ?? "No file selected"}</strong>
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
                <Metric label="Renderways" value={preview.totalRenderwaysRows} />
                <Metric label="Flex matched" value={preview.flexMatchedRows} />
                <Metric label="Call Plan matched" value={preview.callPlanMatchedRows} />
                <Metric label="Flex missing" value={preview.unmatchedFlexRows} />
                <Metric label="Call Plan missing" value={preview.unmatchedCallPlanRows} />
              </div>
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
                  <Metric label="Unmatched" value={report.unmatchedTicketCount} />
                </div>
              </div>
              <div className="downloadActions">
                <button
                  className="downloadBtn excelBtn"
                  onClick={() => downloadReportAsXlsx(report)}
                >
                  ⬇ Download Excel (.xls)
                </button>
                <button
                  className="downloadBtn csvBtn"
                  onClick={() => downloadReportAsExcel(report)}
                >
                  ⬇ Download CSV
                </button>
              </div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      {DAILY_CALL_PLAN_COLUMNS.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={row.serialNo}>
                        {DAILY_CALL_PLAN_COLUMNS.map((column) => (
                          <td key={column}>{row.output[column]}</td>
                        ))}
                      </tr>
                    ))}
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
