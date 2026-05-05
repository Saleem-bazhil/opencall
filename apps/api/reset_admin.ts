import bcrypt from "bcryptjs";
import { query, closeDatabasePool } from "./src/config/database.js";

async function resetPassword() {
  const email = "admin@opencall.com";
  const password = "admin123";
  const hash = await bcrypt.hash(password, 10);

  try {
    await query("UPDATE users SET password_hash = $1 WHERE email = $2", [hash, email]);
    console.log(`Password for ${email} reset to ${password}`);
  } catch (error) {
    console.error("Error resetting password:", error);
  } finally {
    await closeDatabasePool();
  }
}

resetPassword();
