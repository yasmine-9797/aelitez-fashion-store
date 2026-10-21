import type { NextFunction, Request, Response } from "express";
import { originAllowed } from "../config/env.ts";
import { COOKIE, SESSION_TTL_MS, cookieOptions } from "../lib/cookies.ts";
import { randomToken, safeEqual } from "../lib/crypto.ts";
import { AppError } from "../lib/errors.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Returns the caller's CSRF token, issuing one (HttpOnly cookie + response body) if needed. */
export function issueCsrfToken(req: Request, res: Response): string {
  const existing: unknown = req.cookies?.[COOKIE.csrf];
  if (typeof existing === "string" && existing.length >= 32 && existing.length <= 64) return existing;
  const token = randomToken();
  res.cookie(COOKIE.csrf, token, cookieOptions(SESSION_TTL_MS));
  return token;
}

/**
 * CSRF defence for cookie-authenticated requests: state-changing requests must carry an
 * X-CSRF-Token header equal to the HttpOnly csrf cookie. A cross-site page can neither read
 * the token (CORS) nor add the header without a preflight that the CORS allowlist rejects.
 * The Origin header, when present, must also be an allowed storefront origin.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get("origin");
  if (origin && !originAllowed(origin)) {
    throw new AppError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed.");
  }
  const cookie: unknown = req.cookies?.[COOKIE.csrf];
  const header = req.get("x-csrf-token");
  if (typeof cookie !== "string" || !header || !safeEqual(cookie, header)) {
    throw new AppError(403, "CSRF_FAILED", "Your session has expired. Please refresh the page and try again.");
  }
  next();
}
