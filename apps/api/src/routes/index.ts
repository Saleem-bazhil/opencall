import { Router } from "express";
import { authRouter } from "./authRoutes.js";
import { healthRouter } from "./healthRoutes.js";
import { matchRouter } from "./matchRoutes.js";
import { reportRouter } from "./reportRoutes.js";
import { reportRowRouter } from "./reportRowRoutes.js";
import { uploadRouter } from "./uploadRoutes.js";
import { historyRouter } from "./historyRoutes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/health", healthRouter);
apiRouter.use("/matches", matchRouter);
apiRouter.use("/reports", reportRouter);
apiRouter.use("/report-rows", reportRowRouter);
apiRouter.use("/uploads", uploadRouter);
apiRouter.use("/report-history", historyRouter);
