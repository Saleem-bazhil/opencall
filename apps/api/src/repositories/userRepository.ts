import type { PoolClient } from "pg";
import { query } from "../config/database.js";
import type { AuthenticatedUser } from "../types/auth.js";

interface UserRow {
  id: string;
  email: string;
  role: AuthenticatedUser["role"];
  region_id: string | null;
}

function mapUser(row: UserRow): AuthenticatedUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    regionId: row.region_id,
    region_id: row.region_id,
  };
}

export async function findActiveUserById(
  userId: string,
): Promise<AuthenticatedUser | null> {
  const result = await query<UserRow>(
    `
      SELECT id, email, role, region_id
      FROM users
      WHERE id = $1
        AND is_active = TRUE
      LIMIT 1
    `,
    [userId],
  );
  const row = result.rows[0];

  return row ? mapUser(row) : null;
}

export async function findActiveUserByEmail(
  email: string,
): Promise<AuthenticatedUser | null> {
  const result = await query<UserRow>(
    `
      SELECT id, email, role, region_id
      FROM users
      WHERE lower(email) = lower($1)
        AND is_active = TRUE
      LIMIT 1
    `,
    [email],
  );
  const row = result.rows[0];

  return row ? mapUser(row) : null;
}

export async function findActiveUserByIdForShare(
  client: PoolClient,
  userId: string,
): Promise<AuthenticatedUser | null> {
  const result = await client.query<UserRow>(
    `
      SELECT id, email, role, region_id
      FROM users
      WHERE id = $1
        AND is_active = TRUE
      LIMIT 1
      FOR SHARE
    `,
    [userId],
  );
  const row = result.rows[0];

  return row ? mapUser(row) : null;
}
