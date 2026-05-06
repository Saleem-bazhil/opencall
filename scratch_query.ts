import fs from 'node:fs';
import { query, closeDatabasePool } from './apps/api/src/config/database.js';

async function run() {
  try {
    const migration005 = fs.readFileSync('../../infra/postgres/migrations/005_add_product_line_name.sql', 'utf8');
    await query(migration005);
    console.log("Migration 005 executed");

    const migration006 = fs.readFileSync('../../infra/postgres/migrations/006_add_work_location.sql', 'utf8');
    await query(migration006);
    console.log("Migration 006 executed");

  } catch (error) {
    console.error("Error executing migration:", error);
  } finally {
    await closeDatabasePool();
  }
}
run();
