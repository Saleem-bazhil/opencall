import { pool, query } from "../config/database.js";

export interface DatabaseHealth {
  connected: boolean;
  checkedAt: string;
  databaseName: string | null;
  latencyMs: number;
  pool: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  error: string | null;
}

interface DatabaseHealthRow {
  database_name: string;
  checked_at: Date;
}

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const startedAt = Date.now();

  try {
    const result = await query<DatabaseHealthRow>(
      "SELECT current_database() AS database_name, NOW() AS checked_at",
    );
    const row = result.rows[0];

    return {
      connected: true,
      checkedAt: row?.checked_at.toISOString() ?? new Date().toISOString(),
      databaseName: row?.database_name ?? null,
      latencyMs: Date.now() - startedAt,
      pool: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
      error: null,
    };
  } catch (error) {
    return {
      connected: false,
      checkedAt: new Date().toISOString(),
      databaseName: null,
      latencyMs: Date.now() - startedAt,
      pool: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}
