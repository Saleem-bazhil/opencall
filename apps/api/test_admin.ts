import AdminJS from "adminjs";
import { Database, Resource, Adapter } from "@adminjs/sql";
import { env } from "./src/config/env.js";

async function testAdmin() {
  try {
    AdminJS.registerAdapter({ Database, Resource });
    console.log("Adapter registered");

    const adapter = new Adapter("postgresql", {
      connectionString: env.DATABASE_URL,
      database: env.DATABASE_URL.split("/").pop()?.split("?")[0] || "opencall",
    });
    
    const db = await adapter.init();
    console.log("Database initialized");

    const admin = new AdminJS({
      resources: [
        {
          resource: db.table("users"),
          options: {},
        },
      ],
    });
    console.log("AdminJS initialized");
    process.exit(0);
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

testAdmin();
