import AdminJS from "adminjs";
import AdminJSExpress from "@adminjs/express";
import { Database, Resource, Adapter } from "@adminjs/sql";
import session from "express-session";
import bcrypt from "bcryptjs";
import type { Express } from "express";
import { query } from "../config/database.js";
import { env } from "../config/env.js";

type AdminUser = {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "REGION_ADMIN";
};

async function authenticateAdmin(
  email: string,
  password: string,
): Promise<AdminUser | null> {
  const result = await query<{
    id: string;
    email: string;
    password_hash: string;
    role: "SUPER_ADMIN" | "REGION_ADMIN";
    is_active: boolean;
  }>(
    `
      SELECT id, email, password_hash, role, is_active
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [email],
  );

  const user = result.rows[0];

  if (!user || !user.is_active) return null;
  if (!["SUPER_ADMIN", "REGION_ADMIN"].includes(user.role)) return null;

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

const canModify = ({ currentAdmin }: { currentAdmin?: AdminUser }) =>
  currentAdmin?.role === "SUPER_ADMIN";

AdminJS.registerAdapter({ Database, Resource });

export async function setupAdmin(app: Express) {
  const db = await new Adapter("postgresql", {
    connectionString: env.DATABASE_URL,
    database: env.DATABASE_URL.split("/").pop()?.split("?")[0] || "opencall",
  }).init();

  const admin = new AdminJS({
    rootPath: "/admin",
    branding: {
      companyName: "OpenCall Admin",
      withMadeWithLove: false,
    },
    resources: [
      {
        resource: db.table("users"),
        options: {
          navigation: { name: "Core", icon: "User" },
          properties: {
            password_hash: {
              isVisible: false,
            },
          },
          actions: {
            new: { isAccessible: canModify },
            edit: { isAccessible: canModify },
            delete: { isAccessible: canModify },
            bulkDelete: { isAccessible: canModify },
          },
          listProperties: ["name", "email", "role", "is_active", "created_at"],
        },
      },
      {
        resource: db.table("source_upload_batches"),
        options: {
          navigation: { name: "Uploads", icon: "Upload" },
          actions: {
            new: { isAccessible: false },
            edit: { isAccessible: false },
            delete: { isAccessible: false },
            bulkDelete: { isAccessible: false },
          },
        },
      },
      {
        resource: db.table("daily_call_plan_reports"),
        options: {
          navigation: { name: "Reports", icon: "Report" },
          actions: {
            new: { isAccessible: false },
            edit: { isAccessible: false },
            delete: { isAccessible: canModify },
            bulkDelete: { isAccessible: canModify },
          },
        },
      },
    ],
  });

  const router = AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      authenticate: authenticateAdmin,
      cookieName: "opencall_admin",
      cookiePassword: process.env.ADMIN_COOKIE_SECRET || "change-this-secret",
    },
    null,
    {
      secret: process.env.ADMIN_SESSION_SECRET || "change-this-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 8,
      },
    } as session.SessionOptions,
  );

  app.use(admin.options.rootPath, router);
}