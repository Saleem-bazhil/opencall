import type { RequestHandler } from "express";
import { findActiveUserById } from "../repositories/userRepository.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { unauthorized } from "../utils/httpError.js";
import { verifyToken } from "../utils/jwt.js";

function getBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    throw unauthorized("Missing Authorization header");
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw unauthorized("Authorization header must use Bearer token");
  }

  return token;
}

export const requireAuthenticatedUser: RequestHandler = asyncHandler(
  async (request, _response, next) => {
    const token = getBearerToken(request.header("authorization"));
    const payload = verifyToken(token);

    const user = await findActiveUserById(payload.userId);

    if (!user) {
      throw unauthorized("Authenticated user was not found or is inactive");
    }

    request.currentUser = user;
    next();
  },
);
