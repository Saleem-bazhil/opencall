import type { UploadSourceType } from "@opencall/shared";
import { readExcelSheet } from "../services/excelParser/excelWorkbookReader.js";
import type { UploadColumnValidationResult } from "../types/upload.js";

export function validateExcelHeaders(
  file: Express.Multer.File,
  sourceType: UploadSourceType,
): UploadColumnValidationResult {
  const sheet = readExcelSheet(file.path, sourceType);

  return {
    sourceType,
    originalFileName: file.originalname,
    rowNumber: sheet.headerRowNumber,
    isValid: sheet.missingColumns.length === 0,
    detectedHeaders: sheet.detectedHeaders,
    missingColumns: sheet.missingColumns,
  };
}
