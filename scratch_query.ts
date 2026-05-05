import { query, closeDatabasePool } from './apps/api/src/config/database.js';

import fs from 'node:fs';
import { query, closeDatabasePool } from './apps/api/src/config/database.js';

async function run() {
  try {
    const sql = fs.readFileSync('../../infra/postgres/migrations/004_report_history_sessions.sql', 'utf8');
    const result = await query(sql);
    console.log("Migration executed successfully:", result);
  } catch (error) {
    console.error("Error executing migration:", error);
  } finally {
    await closeDatabasePool();
  }
}
run();
