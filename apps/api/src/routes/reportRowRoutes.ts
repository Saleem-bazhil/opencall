import { Router } from "express";
import { updateReportRowController } from "../controllers/reportRowController.js";
import { requireAuthenticatedUser } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/roleMiddleware.js";

export const reportRowRouter = Router();

reportRowRouter.patch(
  "/:id",
  requireAuthenticatedUser,
  requireRole(["SUPER_ADMIN", "REGION_ADMIN"]),
  updateReportRowController,
);
