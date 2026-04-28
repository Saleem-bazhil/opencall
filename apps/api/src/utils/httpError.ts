export class HttpError extends Error {
  readonly statusCode: number;
  readonly details: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function unauthorized(message = "Unauthorized", details?: unknown): HttpError {
  return new HttpError(401, message, details);
}

export function forbidden(message = "Forbidden", details?: unknown): HttpError {
  return new HttpError(403, message, details);
}

export function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, message, details);
}

export function unprocessableEntity(
  message: string,
  details?: unknown,
): HttpError {
  return new HttpError(422, message, details);
}
