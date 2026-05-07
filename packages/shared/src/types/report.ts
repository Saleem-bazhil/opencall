import type {
  ReportChangedFields,
  ReportChangeType,
} from "./reportComparison.js";

export type UploadSourceType = "FLEX_WIP" | "RENDERWAYS" | "CALL_PLAN";

export type DailyCallPlanSegment = string;

export interface DailyCallPlanRow {
  serialNo: number;
  ticketId: string;
  caseId: string;
  caseCreatedTime: string | null;
  wipAging: string | null;
  rtplStatus: string;
  segment: DailyCallPlanSegment;
  engineer: string | null;
  product: string | null;
  flexStatus: string | null;
  hpOwnerStatus: string | null;
  woOtcCode: string | null;
  accountName: string | null;
  customerName: string | null;
  location: string | null;
  contact: string | null;
  part: string | null;
  wipAgingCategory: string | null;
  tat: string | null;
  customerMail: string | null;
  rca: string | null;
  changeType?: ReportChangeType | null;
  previousFlexStatus?: string | null;
  previousRtplStatus?: string | null;
  previousWipAging?: string | null;
  changedFields?: ReportChangedFields;
  changeSummary?: string | null;
}
