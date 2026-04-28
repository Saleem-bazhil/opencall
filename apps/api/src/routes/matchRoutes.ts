import { Router } from "express";
import { matchPreviewController } from "../controllers/matchPreviewController.js";
import { requireAuthenticatedUser } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/roleMiddleware.js";

export const matchRouter = Router();

matchRouter.post(
  "/preview",
  requireAuthenticatedUser,
  requireRole(["SUPER_ADMIN", "REGION_ADMIN"]),
  matchPreviewController,
);
