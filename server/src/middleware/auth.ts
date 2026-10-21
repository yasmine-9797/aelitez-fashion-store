import type { NextFunction, Request, Response } from "express";
import { COOKIE, SESSION_TTL_MS, clearCookie, cookieOptions } from "../lib/cookies.ts";
import { sha256 } from "../lib/crypto.ts";
import { forbidden, unauthorized } from "../lib/errors.ts";
import { prisma, type Role } from "../lib/prisma.ts";
import type { AuthUser } from "../types/express.d.ts";

const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

/** Resolves the session cookie to a user. Never fails the request — unauthenticated is a valid state. */
export async function loadSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies?.[COOKIE.session];
  if (typeof token !== "string" || token.length < 20 || token.length > 128) return next();

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, expiresAt: true, lastSeenAt: true, user: { select: { id: true, email: true, name: true, role: true, emailVerifiedAt: true } } },
  });
  if (!session || session.expiresAt <= new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    clearCookie(res, COOKIE.session);
    return next();
  }
  req.user = session.user;
  req.sessionId = session.id;

  // Sliding expiry, written at most once a day per session.
  if (Date.now() - session.lastSeenAt.getTime() > RENEW_AFTER_MS) {
    const now = new Date();
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) } });
    res.cookie(COOKIE.session, token, cookieOptions(SESSION_TTL_MS));
  }
  next();
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw unauthorized();
  next();
}

/** Role-based permissions for the admin area. STAFF run day-to-day operations; money and settings are ADMIN-only. */
export const PERMISSIONS = {
  "admin:access": ["ADMIN", "STAFF"],
  "catalog:write": ["ADMIN", "STAFF"],
  "inventory:write": ["ADMIN", "STAFF"],
  "orders:read": ["ADMIN", "STAFF"],
  "orders:write": ["ADMIN", "STAFF"],
  "returns:write": ["ADMIN", "STAFF"],
  "reviews:moderate": ["ADMIN", "STAFF"],
  "refunds:write": ["ADMIN"],
  "coupons:manage": ["ADMIN"],
  "settings:manage": ["ADMIN"],
  "audit:read": ["ADMIN"],
  "newsletter:read": ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export const hasPermission = (role: Role, permission: Permission): boolean => (PERMISSIONS[permission] as readonly Role[]).includes(role);

export const requirePermission =
  (permission: Permission) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const user = currentUser(req);
    if (!hasPermission(user.role, permission)) throw forbidden();
    next();
  };
