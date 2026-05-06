import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import type { GeneratedReportResponse } from "./apiClient";
import * as XLSX from "xlsx";

export function downloadReportAsExcel(report: GeneratedReportResponse): void {
  // Build CSV content (works without any library)
  const headers = ["Change Type", "Change Summary", ...DAILY_CALL_PLAN_COLUMNS];

  const escapeCSV = (value: string | number | null | undefined): string => {
    const str = String(value ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows: string[] = [];
  csvRows.push(headers.map(escapeCSV).join(","));

  for (const row of report.rows) {
    const values = [
      escapeCSV(row.comparison?.changeType ?? ""),
      escapeCSV(row.comparison?.changeSummary ?? ""),
      ...DAILY_CALL_PLAN_COLUMNS.map((col) => escapeCSV(row.output[col])),
    ];
    csvRows.push(values.join(","));
  }

  const csvContent = "\uFEFF" + csvRows.join("\r\n"); // BOM for Excel UTF-8
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;

  const date = report.reportDate || new Date().toISOString().split("T")[0];
  link.download = `Daily_Call_Plan_${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadReportAsXlsx(report: GeneratedReportResponse): void {
  const headers = ["Change Type", "Change Summary", ...DAILY_CALL_PLAN_COLUMNS];

  // Build a 2D array: headers + data rows
  const data: (string | number)[][] = [];
  data.push([...headers]);

  for (const row of report.rows) {
    const values = [
      row.comparison?.changeType ?? "",
      row.comparison?.changeSummary ?? "",
      ...DAILY_CALL_PLAN_COLUMNS.map((col) => row.output[col] ?? ""),
    ];
    data.push(values);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Auto-size columns slightly
  ws["!cols"] = headers.map(() => ({ wch: 20 }));

  XLSX.utils.book_append_sheet(wb, ws, "Daily Call Plan");

  const date = report.reportDate || new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `Daily_Call_Plan_${date}.xlsx`);
}
