import pg from "pg";
import { env } from "../config/env.js";

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
});

async function check() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'daily_call_plan_reports'
        AND column_name IN ('call_plan_upload_batch_id', 'renderways_upload_batch_id')
    `);
    console.log("Column nullability:");
    for (const row of result.rows) {
      console.log(`  ${row.column_name}: ${row.is_nullable}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

check();
