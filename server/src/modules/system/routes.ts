import { Router } from "express";
import { z } from "zod";
import { newsletterSchema } from "@shared/validation";
import type { AppConfigDTO } from "@shared/types";
import { emailEnabled, env, razorpayEnabled } from "../../config/env.ts";
import { randomToken, sha256 } from "../../lib/crypto.ts";
import { ok, parse } from "../../lib/http.ts";
import { prisma } from "../../lib/prisma.ts";
import { writeLimiter } from "../../middleware/rate-limit.ts";

export const systemRouter = Router();

/** Liveness — the process is up. */
systemRouter.get("/health", (_req, res) => {
  res.set("Cache-Control", "no-store").json(ok({ status: "ok", uptimeSeconds: Math.round(process.uptime()) }));
});

/** Readiness — the database answers. Use this for load-balancer health checks. */
systemRouter.get("/health/ready", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json(ok({ status: "ready", database: "ok" }));
  } catch {
    res.status(503).json({ error: { code: "NOT_READY", message: "Database unavailable." } });
  }
});

/** What the storefront may offer — lets it show honest "not configured" states. */
systemRouter.get("/config", (_req, res) => {
  const config: AppConfigDTO = {
    payments: { razorpay: { enabled: razorpayEnabled, keyId: razorpayEnabled ? (env.RAZORPAY_KEY_ID ?? null) : null }, cod: { enabled: env.COD_ENABLED } },
    emailEnabled,
    returnWindowDays: env.RETURN_WINDOW_DAYS,
    maxCartQuantity: env.MAX_CART_QUANTITY,
  };
  res.set("Cache-Control", "public, max-age=60").json(ok(config));
});

// ───────────── Newsletter ─────────────

systemRouter.post("/newsletter", writeLimiter, async (req, res) => {
  const { email, source } = parse(newsletterSchema, req.body);
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
  if (!existing) {
    await prisma.newsletterSubscriber.create({ data: { email, consentAt: new Date(), source: source ?? null, unsubscribeTokenHash: sha256(randomToken()) } });
  } else if (existing.unsubscribedAt) {
    await prisma.newsletterSubscriber.update({ where: { email }, data: { unsubscribedAt: null, consentAt: new Date() } });
  }
  // Same response either way, so the form cannot be used to check who is subscribed.
  res.status(201).json(ok({ subscribed: true }));
});

systemRouter.post("/newsletter/unsubscribe", writeLimiter, async (req, res) => {
  const { token } = parse(z.object({ token: z.string().min(20).max(200) }), req.body);
  await prisma.newsletterSubscriber.updateMany({ where: { unsubscribeTokenHash: sha256(token), unsubscribedAt: null }, data: { unsubscribedAt: new Date() } });
  res.json(ok({ unsubscribed: true }));
});
