import pg from "pg";
import { env } from "../config/env.js";

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
});

async function apply() {
  const client = await pool.connect();
  try {
    console.log("Applying migration 002...");
    await client.query(`
      ALTER TABLE daily_call_plan_reports
        ALTER COLUMN renderways_upload_batch_id DROP NOT NULL,
        ALTER COLUMN call_plan_upload_batch_id DROP NOT NULL;
    `);
    console.log("Migration 002 applied.");

    console.log("Applying migration 003...");
    await client.query(`
      ALTER TABLE daily_call_plan_reports
        ALTER COLUMN renderways_upload_batch_id DROP NOT NULL;
    `);
    await client.query(`
      ALTER TABLE daily_call_plan_reports
        ALTER COLUMN call_plan_upload_batch_id DROP NOT NULL;
    `);
    console.log("Migration 003 applied.");

    console.log("All migrations applied successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

apply();
