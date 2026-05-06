import type { DailyCallPlanColumn } from "@opencall/shared";
import type {
  ReportComparisonSummary,
  ReportRowComparisonInsight,
} from "@opencall/shared";
import type {
  DuplicateTrackingSummary,
  EnrichedCallPlanRow,
  MatchedCallPlanRecord,
} from "./matching.js";

export type DailyCallPlanOutputRow = Record<DailyCallPlanColumn, string | number>;

export interface GenerateDailyCallPlanInput {
  reportDate: string;
  generatedBy: string;
  regionId: string | null;
  flexUploadBatchId: string;
  renderwaysUploadBatchId?: string | null | undefined;
  callPlanUploadBatchId?: string | null | undefined;
}

export interface GeneratedDailyCallPlanRow {
  serialNo: number;
  output: DailyCallPlanOutputRow;
  enriched: EnrichedCallPlanRow;
  match: MatchedCallPlanRecord;
  comparison: ReportRowComparisonInsight | null;
}

export interface GeneratedReportComparisonMetadata {
  skipped: boolean;
  reason: "NO_PREVIOUS_REPORT" | null;
  currentSessionId: string;
  previousSessionId: string | null;
  summary: ReportComparisonSummary | null;
  duplicateTicketIds: {
    current: string[];
    previous: string[];
  };
}

export interface RegionBreakdownEntry {
  aspCode: string;
  regionName: string;
  count: number;
  woOtcCodeBreakdown: Array<{
    code: string;
    count: number;
  }>;
}

export interface GeneratedDailyCallPlanReport {
  reportId: string;
  sessionId: string;
  reportDate: string;
  columns: readonly DailyCallPlanColumn[];
  totalRows: number;
  duplicateTicketCount: number;
  unmatchedTicketCount: number;
  duplicateTracking: DuplicateTrackingSummary;
  comparison: GeneratedReportComparisonMetadata;
  regionBreakdown: RegionBreakdownEntry[];
  rows: GeneratedDailyCallPlanRow[];
}
