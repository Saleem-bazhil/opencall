import { query, closeDatabasePool } from "./src/config/database.js";

async function checkTables() {
  try {
    const result = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log("Tables:", result.rows.map(r => r.table_name));
  } catch (error) {
    console.error("Error checking tables:", error);
  } finally {
    await closeDatabasePool();
  }
}

checkTables();
