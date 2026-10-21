/** An error that is safe to show to API clients. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, code = "BAD_REQUEST", details?: Record<string, string[]>) =>
  new AppError(400, code, message, details);
export const unauthorized = (message = "Please sign in to continue.") => new AppError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "You do not have permission to do that.") => new AppError(403, "FORBIDDEN", message);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const conflict = (message: string, code = "CONFLICT") => new AppError(409, code, message);
export const unprocessable = (message: string, code = "UNPROCESSABLE") => new AppError(422, code, message);
export const serviceUnavailable = (message: string, code = "SERVICE_UNAVAILABLE") => new AppError(503, code, message);
