import type { Request, Response } from "express";
import type { UserDTO } from "@shared/types";
import { env } from "../../config/env.ts";
import { audit } from "../../lib/audit.ts";
import { COOKIE, SESSION_TTL_MS, clearCookie, cookieOptions } from "../../lib/cookies.ts";
import { randomToken, sha256 } from "../../lib/crypto.ts";
import { AppError, badRequest, conflict, unauthorized } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { passwordResetEmail, sendMail, verificationEmail } from "../../lib/mailer.ts";
import { getDummyHash, hashPassword, verifyPassword } from "../../lib/password.ts";
import { AuthTokenType, Role, prisma } from "../../lib/prisma.ts";
import { mergeGuestCart } from "../cart/service.ts";

const RESET_TTL_MS = 30 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const storefront = (path: string) => `${env.STOREFRONT_URL.replace(/\/$/, "")}${path}`;

export async function toUserDTO(userId: string): Promise<UserDTO> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    emailVerified: u.emailVerifiedAt !== null,
    phone: u.profile?.phone ?? null,
    marketingConsent: u.profile?.marketingConsent ?? false,
  };
}

/** Starts a fresh session (new random token — never reuses one) and sets the cookie. */
async function startSession(req: Request, res: Response, userId: string): Promise<void> {
  const token = randomToken();
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), userAgent: req.get("user-agent")?.slice(0, 255) ?? null, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  // Drop any previous session cookie for this browser (session fixation protection).
  if (req.sessionId) await prisma.session.delete({ where: { id: req.sessionId } }).catch(() => undefined);
  res.cookie(COOKIE.session, token, cookieOptions(SESSION_TTL_MS));
  await mergeGuestCart(req, res, userId);
}

async function issueToken(userId: string, type: AuthTokenType, ttlMs: number): Promise<string> {
  const token = randomToken();
  await prisma.$transaction([
    // Only the newest link of each kind works.
    prisma.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.authToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) } }),
  ]);
  return token;
}

async function consumeToken(token: string, type: AuthTokenType) {
  const row = await prisma.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt <= new Date()) {
    throw badRequest("This link is invalid or has expired. Please request a new one.", "INVALID_TOKEN");
  }
  const claimed = await prisma.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw badRequest("This link has already been used.", "INVALID_TOKEN");
  return row;
}

export async function sendVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return;
  const token = await issueToken(user.id, AuthTokenType.EMAIL_VERIFICATION, VERIFY_TTL_MS);
  await sendMail(verificationEmail(user.email, user.name, storefront(`/verify-email?token=${token}`))).catch((err) => logger.warn({ err }, "Verification email failed"));
}

export async function register(req: Request, res: Response, input: { name: string; email: string; password: string; marketingConsent?: boolean | undefined }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw conflict("An account with this email already exists. Sign in or reset your password.", "EMAIL_TAKEN");
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: Role.CUSTOMER,
      profile: { create: { marketingConsent: input.marketingConsent ?? false } },
    },
  });
  await startSession(req, res, user.id);
  void sendVerification(user.id);
  return toUserDTO(user.id);
}

export async function login(req: Request, res: Response, input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true, passwordHash: true } });
  // Verify against a dummy hash when the account does not exist, so timing does not reveal it.
  const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), input.password);
  if (!user || !valid) throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
  await startSession(req, res, user.id);
  return toUserDTO(user.id);
}

export async function logout(req: Request, res: Response): Promise<void> {
  if (req.sessionId) await prisma.session.delete({ where: { id: req.sessionId } }).catch(() => undefined);
  clearCookie(res, COOKIE.session);
}

/** Always responds the same way, whether or not the email has an account. */
export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const token = await issueToken(user.id, AuthTokenType.PASSWORD_RESET, RESET_TTL_MS);
  await sendMail(passwordResetEmail(user.email, user.name, storefront(`/reset-password?token=${token}`))).catch((err) => logger.warn({ err }, "Password reset email failed"));
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const row = await consumeToken(token, AuthTokenType.PASSWORD_RESET);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password) } });
    // Signs out every device — whoever had access before the reset loses it.
    await tx.session.deleteMany({ where: { userId: row.userId } });
    await audit(tx, { actorId: row.userId, action: "auth.password_reset", entityType: "User", entityId: row.userId });
  });
}

export async function verifyEmail(token: string): Promise<void> {
  const row = await consumeToken(token, AuthTokenType.EMAIL_VERIFICATION);
  await prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
}

export async function changePassword(req: Request, currentPassword: string, newPassword: string): Promise<void> {
  if (!req.user) throw unauthorized();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id }, select: { id: true, passwordHash: true } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) throw badRequest("Your current password is incorrect.", "INVALID_CREDENTIALS");
  if (currentPassword === newPassword) throw badRequest("Choose a password you haven't used here before.", "SAME_PASSWORD");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    // Keep this device signed in; sign out all others.
    await tx.session.deleteMany({ where: { userId: user.id, ...(req.sessionId ? { id: { not: req.sessionId } } : {}) } });
    await audit(tx, { actorId: user.id, action: "auth.password_change", entityType: "User", entityId: user.id });
  });
}
