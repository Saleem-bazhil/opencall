import type { GeneratedReportResponse } from "./apiClient";

export const ALL_REGIONS_FILTER = "ALL";

export interface RtplStatusMetric {
  status: string;
  count: number;
}

export interface WoOtcBreakdownEntry {
  code: string;
  count: number;
}

type ReportRow = GeneratedReportResponse["rows"][number];

function cleanedString(value: unknown): string {
  return String(value ?? "").trim();
}

export function buildOverallWoOtcBreakdown(
  regionBreakdown: GeneratedReportResponse["regionBreakdown"],
): WoOtcBreakdownEntry[] {
  const counts = new Map<string, number>();

  for (const entry of regionBreakdown) {
    for (const wo of entry.woOtcCodeBreakdown ?? []) {
      counts.set(wo.code, (counts.get(wo.code) ?? 0) + wo.count);
    }
  }

  return Array.from(counts.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

export function filterRowsByRegion(
  rows: readonly ReportRow[],
  regionFilter: string | null | undefined,
): ReportRow[] {
  if (!regionFilter || regionFilter === ALL_REGIONS_FILTER) {
    return [...rows];
  }

  return rows.filter((row) => row.output["Work Location"] === regionFilter);
}

export function buildRtplOperationalAnalytics(
  rows: readonly ReportRow[],
): RtplStatusMetric[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const status = cleanedString(row.output["RTPL status"]);

    if (!status || status === "Manual Entry Required") {
      continue;
    }

    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

export function reportWithRows(
  report: GeneratedReportResponse,
  rows: readonly ReportRow[],
): GeneratedReportResponse {
  return {
    ...report,
    totalRows: rows.length,
    rows: [...rows],
  };
}
