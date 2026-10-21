import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";
import { AppError } from "../lib/errors.ts";
import { zodDetails } from "../lib/http.ts";
import { logger } from "../lib/logger.ts";

function send(res: Response, status: number, code: string, message: string, details?: Record<string, string[]>) {
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

export function notFoundHandler(_req: Request, res: Response): void {
  send(res, 404, "NOT_FOUND", "This endpoint does not exist.");
}

/** Maps errors to the API's error format. Unexpected errors are logged with the request id, never returned. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;
  if (err instanceof AppError) return send(res, err.status, err.code, err.message, err.details);

  const e = err as { name?: string; type?: string; code?: string; status?: number; issues?: unknown };
  if (e?.name === "ZodError" && Array.isArray(e.issues)) return send(res, 400, "VALIDATION_ERROR", "Some details need fixing.", zodDetails(err as ZodError));
  if (e?.type === "entity.parse.failed") return send(res, 400, "INVALID_JSON", "The request body is not valid JSON.");
  if (e?.type === "entity.too.large") return send(res, 413, "PAYLOAD_TOO_LARGE", "The request is too large.");
  if (e?.name === "MulterError") {
    return e.code === "LIMIT_FILE_SIZE"
      ? send(res, 413, "FILE_TOO_LARGE", "That file is too large.")
      : send(res, 400, "UPLOAD_REJECTED", "That upload was rejected.");
  }
  // Prisma: unique constraint / missing record raced past our own checks.
  if (e?.code === "P2002") return send(res, 409, "CONFLICT", "That already exists.");
  if (e?.code === "P2025") return send(res, 404, "NOT_FOUND", "Resource not found.");

  logger.error({ err, requestId: req.requestId, path: req.path }, "Unhandled error");
  send(res, 500, "INTERNAL", `Something went wrong on our side. Reference: ${req.requestId}`);
}
