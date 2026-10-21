import type { Request } from "express";
import type { ZodError, ZodTypeAny, z } from "zod";
import { AppError, notFound } from "./errors.ts";

/** A single route parameter as a bounded string (ids, slugs). Anything else is treated as not found. */
export function param(req: Request, name: string): string {
  const value: unknown = req.params[name];
  if (typeof value !== "string" || value.length === 0 || value.length > 120) throw notFound();
  return value;
}

/** Field-level messages keyed by dotted path, e.g. { "address.pincode": ["Enter a valid 6-digit PIN code"] }. */
export function zodDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

/** Validates untrusted input against a schema; unknown keys are stripped (no mass assignment). */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new AppError(400, "VALIDATION_ERROR", "Some details need fixing.", zodDetails(result.error));
  return result.data;
}

export const ok = <T>(data: T) => ({ data });

export function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function pagination(query: { page?: number | undefined; pageSize?: number | undefined }, defaultSize = 24) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? defaultSize;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
