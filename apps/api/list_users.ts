import { query, closeDatabasePool } from "./src/config/database.js";

async function listUsers() {
  try {
    const result = await query("SELECT id, email, role, is_active, password_hash FROM users");
    console.log("Users:", result.rows);
  } catch (error) {
    console.error("Error listing users:", error);
  } finally {
    await closeDatabasePool();
  }
}

listUsers();
