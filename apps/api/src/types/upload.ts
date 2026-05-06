import type { UploadSourceType } from "@opencall/shared";

export type UploadFieldName =
  | "flexWipReport"
  | "renderwaysReport"
  | "callPlan";

export interface UploadedSourceFile {
  sourceType: UploadSourceType;
  fieldName: UploadFieldName;
  file: Express.Multer.File;
}

export interface UploadColumnValidationResult {
  sourceType: UploadSourceType;
  originalFileName: string;
  rowNumber: number | null;
  isValid: boolean;
  detectedHeaders: string[];
  missingColumns: string[];
}

export interface CreateUploadBatchInput {
  sourceType: UploadSourceType;
  originalFileName: string;
  storedFilePath: string;
  uploadedBy: string;
  regionId: string | null;
  rowCount: number;
  errors: unknown[];
}

export interface UploadBatchRecord {
  id: string;
  sourceType: UploadSourceType;
  originalFileName: string;
  status: "UPLOADED" | "VALIDATED" | "FAILED" | "PROCESSED";
  rowCount: number;
  errorCount: number;
  createdAt: string;
}

export interface ParsedUploadSummary {
  sourceType: UploadSourceType;
  rowCount: number;
  issueCount: number;
  duplicateNormalizedTicketIds: string[];
  duplicateNormalizedCaseIds: string[];
  duplicateCount: number;
}
