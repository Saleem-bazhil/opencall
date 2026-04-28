import { Router } from "express";
import { authRouter } from "./authRoutes.js";
import { healthRouter } from "./healthRoutes.js";
import { matchRouter } from "./matchRoutes.js";
import { reportRouter } from "./reportRoutes.js";
import { uploadRouter } from "./uploadRoutes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/health", healthRouter);
apiRouter.use("/matches", matchRouter);
apiRouter.use("/reports", reportRouter);
apiRouter.use("/uploads", uploadRouter);
