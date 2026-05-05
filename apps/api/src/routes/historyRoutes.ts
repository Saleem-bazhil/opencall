import { Router } from "express";
import {
  getHistoryListController,
  getHistoryDetailController,
  renameHistoryController,
  deleteHistoryController,
  duplicateHistoryController,
} from "../controllers/historyController.js";
import { requireAuthenticatedUser } from "../middlewares/authMiddleware.js";

export const historyRouter = Router();

historyRouter.use(requireAuthenticatedUser);

historyRouter.get("/", getHistoryListController);
historyRouter.get("/:id", getHistoryDetailController);
historyRouter.patch("/:id", renameHistoryController);
historyRouter.delete("/:id", deleteHistoryController);
historyRouter.post("/:id/duplicate", duplicateHistoryController);
