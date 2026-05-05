import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { checkDatabaseHealth } from "./services/databaseHealthService.js";
import { verifyRuntimeSchema } from "./services/runtime/runtimeVerificationService.js";

const app = await createApp();

app.listen(env.PORT, () => {
  console.log(`OpenCall API listening on port ${env.PORT}`);

  void checkDatabaseHealth().then(async (health) => {
    if (health.connected) {
      console.log(
        `Database connected: ${health.databaseName ?? "unknown"} (${health.latencyMs}ms)`,
      );
      const runtime = await verifyRuntimeSchema().catch((error: unknown) => ({
        ok: false,
        checkedAt: new Date().toISOString(),
        missingTables: [],
        missingColumns: [],
        error: error instanceof Error ? error.message : "Unknown runtime verification error",
      }));

      if (runtime.ok) {
        console.log("Runtime verification passed");
        return;
      }

      console.error("Runtime verification failed", {
        missingTables: runtime.missingTables,
        missingColumns: runtime.missingColumns,
      });
      return;
    }

    console.error(`Database disconnected: ${health.error ?? "unknown error"}`);
  });
});
