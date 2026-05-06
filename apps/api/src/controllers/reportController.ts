import type { RequestHandler } from "express";
import { generateDailyCallPlanReport } from "../services/callPlanGenerator/dailyCallPlanGenerator.js";
import {
  requireCurrentUser,
  resolveEffectiveRegionId,
} from "../services/rbac/regionAccessService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { reportGenerationRequestSchema } from "../validators/reportGenerationRequestValidator.js";

export const generateDailyCallPlanReportController: RequestHandler =
  asyncHandler(async (request, response) => {
    const currentUser = requireCurrentUser(request.currentUser);
    const body = reportGenerationRequestSchema.parse({
      ...request.body,
      generatedBy: currentUser.id,
      regionId: request.header("x-region-id") ?? request.body.regionId ?? null,
    });
    const regionId = resolveEffectiveRegionId(
      currentUser,
      body.regionId ?? null,
    );
    const report = await generateDailyCallPlanReport({
      ...body,
      generatedBy: currentUser.id,
      regionId,
    });

    response.status(201).json({
      data: report,
    });
  });
