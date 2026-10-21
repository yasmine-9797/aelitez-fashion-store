import type { Request, Response } from "express";
import { ipKeyGenerator, rateLimit, type Options } from "express-rate-limit";
import { env } from "../config/env.ts";

// In-memory stores suit a single API instance. When running several instances, plug a shared
// store (e.g. rate-limit-redis) into `store` so limits apply across all of them.

const m = env.RATE_LIMIT_MULTIPLIER;
const handler: Options["handler"] = (_req: Request, res: Response) => {
  res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a few minutes and try again." } });
};
const base = { standardHeaders: "draft-8", legacyHeaders: false, handler } as const;
const ip = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");
const emailOf = (req: Request) => String((req.body as { email?: unknown } | undefined)?.email ?? "").trim().toLowerCase().slice(0, 254);

/** Broad ceiling for the whole API. */
export const apiLimiter = rateLimit({ ...base, windowMs: 5 * 60_000, limit: 1000 * m });

/** Failed sign-ins per IP, and per account across IPs (credential stuffing / brute force). */
export const loginIpLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 20 * m, skipSuccessfulRequests: true, keyGenerator: ip });
export const loginAccountLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 8 * m,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `acct:${emailOf(req)}`,
});

export const registerLimiter = rateLimit({ ...base, windowMs: 60 * 60_000, limit: 10 * m, keyGenerator: ip });
export const passwordResetLimiter = rateLimit({ ...base, windowMs: 60 * 60_000, limit: 5 * m, keyGenerator: (req) => `${ip(req)}:${emailOf(req)}` });
export const checkoutLimiter = rateLimit({ ...base, windowMs: 10 * 60_000, limit: 30 * m, keyGenerator: ip });
export const writeLimiter = rateLimit({ ...base, windowMs: 60 * 60_000, limit: 30 * m, keyGenerator: ip });
