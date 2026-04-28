import type { DailyCallPlanColumn } from "@opencall/shared";
import type {
  EnrichedCallPlanRow,
  MatchedCallPlanRecord,
} from "./matching.js";

export type DailyCallPlanOutputRow = Record<DailyCallPlanColumn, string | number>;

export interface GenerateDailyCallPlanInput {
  reportDate: string;
  generatedBy: string;
  regionId: string | null;
  flexUploadBatchId: string;
  renderwaysUploadBatchId: string;
  callPlanUploadBatchId: string;
}

export interface GeneratedDailyCallPlanRow {
  serialNo: number;
  output: DailyCallPlanOutputRow;
  enriched: EnrichedCallPlanRow;
  match: MatchedCallPlanRecord;
}

export interface GeneratedDailyCallPlanReport {
  reportId: string;
  reportDate: string;
  columns: readonly DailyCallPlanColumn[];
  totalRows: number;
  duplicateTicketCount: number;
  unmatchedTicketCount: number;
  rows: GeneratedDailyCallPlanRow[];
}
