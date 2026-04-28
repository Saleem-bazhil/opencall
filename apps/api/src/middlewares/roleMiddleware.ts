import type { UserRole } from "@opencall/shared";
import type { RequestHandler } from "express";
import { forbidden } from "../utils/httpError.js";

export function requireRole(allowedRoles: readonly UserRole[]): RequestHandler {
  return (request, _response, next) => {
    const user = request.currentUser;

    if (!user || !allowedRoles.includes(user.role)) {
      throw forbidden("User role is not allowed for this operation", {
        allowedRoles,
        actualRole: user?.role ?? null,
      });
    }

    next();
  };
}
