import { closeDatabasePool } from "../config/database.js";
import { checkDatabaseHealth } from "../services/databaseHealthService.js";

const health = await checkDatabaseHealth();

if (health.connected) {
  console.log(
    `Database connected: ${health.databaseName ?? "unknown"} (${health.latencyMs}ms)`,
  );
  await closeDatabasePool();
  process.exit(0);
}

console.error(`Database disconnected: ${health.error ?? "unknown error"}`);
await closeDatabasePool();
process.exit(1);
