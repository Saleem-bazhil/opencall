import { Router } from "express";
import { checkDatabaseHealth } from "../services/databaseHealthService.js";
import { verifyRuntimeSchema } from "../services/runtime/runtimeVerificationService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.status(200).json({
    data: {
      status: "ok",
      service: "opencall-api",
    },
  });
});

healthRouter.get("/db", async (_request, response) => {
  const health = await checkDatabaseHealth();

  response.status(health.connected ? 200 : 503).json({
    data: {
      service: "postgres",
      status: health.connected ? "connected" : "disconnected",
      ...health,
    },
  });
});

healthRouter.get("/runtime", asyncHandler(async (_request, response) => {
  const runtime = await verifyRuntimeSchema();

  response.status(runtime.ok ? 200 : 503).json({
    data: {
      status: runtime.ok ? "ready" : "not_ready",
      ...runtime,
    },
  });
}));
