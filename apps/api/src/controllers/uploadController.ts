import type { RequestHandler } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getUploadedSourceFiles } from "../validators/uploadFileValidator.js";
import { uploadRequestSchema } from "../validators/uploadRequestValidator.js";
import { registerUploadedReports } from "../services/uploadService.js";
import {
  requireCurrentUser,
  resolveEffectiveRegionId,
} from "../services/rbac/regionAccessService.js";

export const uploadReportsController: RequestHandler = asyncHandler(
  async (request, response) => {
    const currentUser = requireCurrentUser(request.currentUser);
    const metadata = uploadRequestSchema.parse({
      uploadedBy: currentUser.id,
      regionId: request.header("x-region-id") ?? request.body.regionId ?? null,
    });
    const regionId = resolveEffectiveRegionId(
      currentUser,
      metadata.regionId ?? null,
    );

    const uploads = getUploadedSourceFiles(request.files);
    const result = await registerUploadedReports({
      uploadedBy: currentUser.id,
      regionId,
      uploads,
    });
    const allSourcesValid = result.validations.every(
      (validation) => validation.isValid,
    );
    const allRowsParsed = result.parseSummaries.every(
      (summary) => summary.issueCount === 0,
    );

    response.status(allSourcesValid && allRowsParsed ? 201 : 422).json({
      data: result,
    });
  },
);
