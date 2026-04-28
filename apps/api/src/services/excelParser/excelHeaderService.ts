import type { UploadColumnValidationResult, UploadedSourceFile } from "../../types/upload.js";
import { validateExcelHeaders } from "../../validators/excelHeaderValidator.js";

export function validateUploadedExcelHeaders(
  uploads: readonly UploadedSourceFile[],
): UploadColumnValidationResult[] {
  return uploads.map((upload) =>
    validateExcelHeaders(upload.file, upload.sourceType),
  );
}
