import { query, closeDatabasePool } from './apps/api/src/config/database.js';

import fs from 'node:fs';
import { query, closeDatabasePool } from './apps/api/src/config/database.js';

async function run() {
  try {
    const sql = fs.readFileSync('../../infra/postgres/migrations/005_add_product_line_name.sql', 'utf8');
    const result = await query(sql);
    console.log("Migration executed successfully:", result);
  } catch (error) {
    console.error("Error executing migration:", error);
  } finally {
    await closeDatabasePool();
  }
}
run();
