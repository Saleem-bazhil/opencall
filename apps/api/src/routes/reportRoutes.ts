import { Router } from "express";
import { generateDailyCallPlanReportController } from "../controllers/reportController.js";
import { requireAuthenticatedUser } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/roleMiddleware.js";

export const reportRouter = Router();

reportRouter.post(
  "/daily-call-plan/generate",
  requireAuthenticatedUser,
  requireRole(["SUPER_ADMIN", "REGION_ADMIN"]),
  generateDailyCallPlanReportController,
);
