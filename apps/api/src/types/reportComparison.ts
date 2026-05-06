import type {
  ReportChangedFields,
  ReportChangeType,
  ReportComparisonSummary,
  ReportRowComparisonInsight,
} from "@opencall/shared";

export interface ComparableReportRow {
  rowId?: string;
  rowNumber: number;
  ticketId: string;
  flexStatus: string | null;
  rtplStatus: string | null;
  wipAging: string | null;
  wipAgingCategory: string | null;
  tat: string | null;
  engineer: string | null;
  location: string | null;
}

export interface IndexedReportRow {
  key: string;
  row: ComparableReportRow;
  duplicateCount: number;
}

export interface ReportRowComparisonResult {
  ticketId: string;
  normalizedTicketId: string;
  changeType: ReportChangeType;
  changedFields: ReportChangedFields;
  currentRow: ComparableReportRow | null;
  previousRow: ComparableReportRow | null;
  insight: ReportRowComparisonInsight;
}

export interface ReportComparisonResult {
  currentSessionId: string;
  previousSessionId: string;
  summary: ReportComparisonSummary;
  rowDiffs: ReportRowComparisonResult[];
  duplicateTicketIds: {
    current: string[];
    previous: string[];
  };
}

export type ReportComparisonSkipReason = "NO_PREVIOUS_REPORT";

export interface SkippedReportComparisonResult {
  skipped: true;
  reason: ReportComparisonSkipReason;
  currentSessionId: string;
}

export type PersistedReportComparisonResult =
  | ({ skipped: false } & ReportComparisonResult)
  | SkippedReportComparisonResult;
