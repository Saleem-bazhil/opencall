import crypto from "node:crypto";
import { env } from "../config/env.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { unauthorized } from "./httpError.js";

export interface JwtPayload {
  userId: string;
  role: AuthenticatedUser["role"];
  regionId: string | null;
}

interface EncodedJwtPayload extends JwtPayload {
  exp: number;
  iat: number;
}

const TOKEN_TTL_SECONDS = 60 * 60 * 8;

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64url");
}

function base64UrlJson(value: unknown): string {
  return base64UrlEncode(JSON.stringify(value));
}

function sign(data: string): string {
  return crypto
    .createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(data)
    .digest("base64url");
}

function parsePayload(payload: unknown): EncodedJwtPayload {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("userId" in payload) ||
    !("role" in payload) ||
    !("exp" in payload) ||
    !("iat" in payload)
  ) {
    throw unauthorized("Invalid token payload");
  }

  const parsed = payload as Partial<EncodedJwtPayload>;

  if (
    typeof parsed.userId !== "string" ||
    (parsed.role !== "SUPER_ADMIN" && parsed.role !== "REGION_ADMIN") ||
    typeof parsed.exp !== "number" ||
    typeof parsed.iat !== "number" ||
    (parsed.regionId !== null &&
      parsed.regionId !== undefined &&
      typeof parsed.regionId !== "string")
  ) {
    throw unauthorized("Invalid token payload");
  }

  return {
    userId: parsed.userId,
    role: parsed.role,
    regionId: parsed.regionId ?? null,
    exp: parsed.exp,
    iat: parsed.iat,
  };
}

export function generateToken(user: AuthenticatedUser): string {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const payload: EncodedJwtPayload = {
    userId: user.id,
    role: user.role,
    regionId: user.regionId,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const unsignedToken = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;

  return `${unsignedToken}.${sign(unsignedToken)}`;
}

export function verifyToken(token: string): JwtPayload {
  const [encodedHeader, encodedPayload, signature] = token.split(".");

  if (!encodedHeader || !encodedPayload || !signature) {
    throw unauthorized("Invalid bearer token");
  }

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = sign(unsignedToken);
  const providedSignature = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    providedSignature.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignature, expectedSignatureBuffer)
  ) {
    throw unauthorized("Invalid bearer token signature");
  }

  const payload = parsePayload(
    JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
  );

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw unauthorized("Bearer token has expired");
  }

  return {
    userId: payload.userId,
    role: payload.role,
    regionId: payload.regionId,
  };
}
