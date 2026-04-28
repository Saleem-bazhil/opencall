import type { UserRole } from "@opencall/shared";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  regionId: string | null;
  region_id: string | null;
}
