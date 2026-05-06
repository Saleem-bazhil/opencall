import type {
  ParsedUploadSummary,
  UploadBatchRecord,
  UploadColumnValidationResult,
  UploadedSourceFile,
} from "../types/upload.js";
import { withTransaction } from "../config/database.js";
import { createUploadBatch } from "../repositories/uploadBatchRepository.js";
import {
  insertCallPlanRecords,
  insertFlexWipRecords,
  insertRenderwaysRecords,
} from "../repositories/sourceRecordRepository.js";
import { validateUploadedExcelHeaders } from "./excelParser/excelHeaderService.js";
import {
  parseSourceFile,
  type ParsedUploadBySource,
} from "./excelParser/sourceParserService.js";

export interface RegisterUploadsInput {
  uploadedBy: string;
  regionId: string | null;
  uploads: readonly UploadedSourceFile[];
}

export interface RegisterUploadsResult {
  batches: UploadBatchRecord[];
  validations: UploadColumnValidationResult[];
  parseSummaries: ParsedUploadSummary[];
}

type ParsedUpload =
  | {
      sourceType: "FLEX_WIP";
      parsed: ParsedUploadBySource["FLEX_WIP"];
    }
  | {
      sourceType: "RENDERWAYS";
      parsed: ParsedUploadBySource["RENDERWAYS"];
    }
  | {
      sourceType: "CALL_PLAN";
      parsed: ParsedUploadBySource["CALL_PLAN"];
    };

function buildValidationErrors(
  validation: UploadColumnValidationResult | undefined,
): unknown[] {
  if (!validation || validation.isValid) {
    return [];
  }

  return [
    {
      type: "MISSING_COLUMNS",
      missingColumns: validation.missingColumns,
      detectedHeaders: validation.detectedHeaders,
    },
  ];
}

function buildParsedUpload(upload: UploadedSourceFile): ParsedUpload {
  switch (upload.sourceType) {
    case "FLEX_WIP":
      return {
        sourceType: "FLEX_WIP",
        parsed: parseSourceFile("FLEX_WIP", upload.file.path),
      };
    case "RENDERWAYS":
      return {
        sourceType: "RENDERWAYS",
        parsed: parseSourceFile("RENDERWAYS", upload.file.path),
      };
    case "CALL_PLAN":
      return {
        sourceType: "CALL_PLAN",
        parsed: parseSourceFile("CALL_PLAN", upload.file.path),
      };
  }
}

function buildParseSummary(upload: ParsedUpload): ParsedUploadSummary {
  return {
    sourceType: upload.sourceType,
    rowCount: upload.parsed.records.length,
    issueCount: upload.parsed.issues.length,
    duplicateNormalizedTicketIds: upload.parsed.duplicateNormalizedTicketIds,
    duplicateNormalizedCaseIds: upload.parsed.duplicateNormalizedCaseIds,
    duplicateCount: upload.parsed.duplicateCount,
  };
}

export async function registerUploadedReports(
  input: RegisterUploadsInput,
): Promise<RegisterUploadsResult> {
  const validations = validateUploadedExcelHeaders(input.uploads);
  const parsedUploads = input.uploads.map((upload) => {
    const validation = validations.find(
      (candidate) => candidate.sourceType === upload.sourceType,
    );

    return validation?.isValid ? buildParsedUpload(upload) : null;
  });

  const batches = await withTransaction(async (client) => {
    const records: UploadBatchRecord[] = [];

    for (const upload of input.uploads) {
      const validation = validations.find(
        (candidate) => candidate.sourceType === upload.sourceType,
      );
      const parsedUpload = parsedUploads.find(
        (candidate): candidate is ParsedUpload =>
          candidate?.sourceType === upload.sourceType,
      );
      const errors = [
        ...buildValidationErrors(validation),
        ...(parsedUpload?.parsed.issues.map((issue) => ({
          type: "ROW_PARSE_ISSUE",
          ...issue,
        })) ?? []),
      ];

      const batch = await createUploadBatch(
        {
          sourceType: upload.sourceType,
          originalFileName: upload.file.originalname,
          storedFilePath: upload.file.path,
          uploadedBy: input.uploadedBy,
          regionId: input.regionId,
          rowCount: parsedUpload?.parsed.records.length ?? 0,
          errors,
        },
        client,
      );

      if (parsedUpload?.sourceType === "FLEX_WIP") {
        await insertFlexWipRecords(client, batch.id, parsedUpload.parsed.records);
      }

      if (parsedUpload?.sourceType === "RENDERWAYS") {
        await insertRenderwaysRecords(
          client,
          batch.id,
          parsedUpload.parsed.records,
        );
      }

      if (parsedUpload?.sourceType === "CALL_PLAN") {
        await insertCallPlanRecords(client, batch.id, parsedUpload.parsed.records);
      }

      records.push(batch);
    }

    return records;
  });

  return {
    batches,
    validations,
    parseSummaries: parsedUploads
      .filter((upload): upload is ParsedUpload => upload !== null)
      .map(buildParseSummary),
  };
}
