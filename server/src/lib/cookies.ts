import type { CookieOptions, Response } from "express";
import { env, isProduction } from "../config/env.ts";

export const COOKIE = {
  session: "aez_sid",
  guestCart: "aez_cart",
  csrf: "aez_csrf",
} as const;

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const GUEST_CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** HttpOnly everywhere; Secure in production (and whenever SameSite=None, which browsers require). */
export function cookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction || env.COOKIE_SAMESITE === "none",
    sameSite: env.COOKIE_SAMESITE,
    path: "/",
    maxAge: maxAgeMs,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function clearCookie(res: Response, name: string): void {
  const { maxAge: _maxAge, ...opts } = cookieOptions(0);
  res.clearCookie(name, opts);
}
