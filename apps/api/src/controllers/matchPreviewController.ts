import type { RequestHandler } from "express";
import { previewMatches } from "../services/compareService/matchPreviewService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { matchPreviewRequestSchema } from "../validators/matchPreviewRequestValidator.js";
import { requireCurrentUser } from "../services/rbac/regionAccessService.js";

export const matchPreviewController: RequestHandler = asyncHandler(
  async (request, response) => {
    const currentUser = requireCurrentUser(request.currentUser);
    const input = matchPreviewRequestSchema.parse(request.body);
    const result = await previewMatches({
      ...input,
      currentUser,
    });

    response.status(200).json({
      data: result,
    });
  },
);
