import { query, closeDatabasePool } from './apps/api/src/config/database.js';

async function run() {
  try {
    await query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING",
      ["admin@example.com", "dummy", "SUPER_ADMIN"]
    );
    console.log("User admin@example.com inserted successfully.");
  } catch (error) {
    console.error("Error inserting user:", error);
  } finally {
    await closeDatabasePool();
  }
}

run();
