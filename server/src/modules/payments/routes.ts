import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { razorpayEnabled } from "../../config/env.ts";
import { currentUser, requireAuth } from "../../middleware/auth.ts";
import { checkoutLimiter } from "../../middleware/rate-limit.ts";
import { badRequest, serviceUnavailable } from "../../lib/errors.ts";
import { ok, parse } from "../../lib/http.ts";
import { logger } from "../../lib/logger.ts";
import { verifyWebhookSignature } from "../../lib/razorpay.ts";
import { ensureGatewayOrder } from "../checkout/service.ts";
import { handleWebhook, verifyCheckoutPayment } from "./service.ts";

export const paymentsRouter = Router();

/** Starts (or resumes) online payment for one of the customer's unpaid orders. */
paymentsRouter.post("/payments/create-order", requireAuth, checkoutLimiter, async (req, res) => {
  const { orderId } = parse(z.object({ orderId: z.string().min(1).max(40) }), req.body);
  res.json(ok(await ensureGatewayOrder(orderId, currentUser(req).id)));
});

paymentsRouter.post("/payments/verify", requireAuth, checkoutLimiter, async (req, res) => {
  const body = parse(
    z.object({
      orderId: z.string().min(1).max(40),
      razorpayOrderId: z.string().min(1).max(64),
      razorpayPaymentId: z.string().min(1).max(64),
      razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/i),
    }),
    req.body,
  );
  res.json(ok(await verifyCheckoutPayment(currentUser(req).id, body)));
});

/**
 * Razorpay webhook. Mounted with a raw body parser (the signature covers the exact bytes) and
 * outside cookie/CSRF handling — it is authenticated by its HMAC signature instead.
 */
export async function razorpayWebhook(req: Request, res: Response): Promise<void> {
  if (!razorpayEnabled) throw serviceUnavailable("Payments are not configured.", "PAYMENTS_NOT_CONFIGURED");
  const signature = req.get("x-razorpay-signature") ?? "";
  const eventId = req.get("x-razorpay-event-id") ?? "";
  const raw = Buffer.isBuffer(req.body) ? req.body : null;
  if (!raw || !signature || !verifyWebhookSignature(raw, signature)) throw badRequest("Invalid webhook signature.", "INVALID_SIGNATURE");
  if (!eventId) throw badRequest("Missing event id.", "MISSING_EVENT_ID");
  const result = await handleWebhook(eventId, raw);
  logger.info({ eventId, result }, "Razorpay webhook");
  res.json(ok({ result }));
}
