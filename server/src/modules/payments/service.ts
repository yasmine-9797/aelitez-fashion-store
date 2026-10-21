// Payment confirmation. An order is marked paid only after the gateway confirms it — a verified
// Checkout signature plus a server-side fetch of the payment, or a verified webhook. Every path
// funnels into markPaymentCaptured, which is idempotent.
import { createHash } from "node:crypto";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { OrderPaymentStatus, OrderStatus, PaymentStatus, Prisma, prisma } from "../../lib/prisma.ts";
import { razorpay, verifyPaymentSignature, type RazorpayPayment } from "../../lib/razorpay.ts";
import { applyRefundUpdate, confirmOrder, lockOrder, notifyOrderConfirmed } from "../orders/service.ts";

type CaptureOutcome = "confirmed" | "already_processed" | "flagged_for_refund";

/**
 * Records a captured gateway payment exactly once. Amount and currency must match the order.
 * If the order was already cancelled (e.g. reservation expired), the money is kept on record
 * and the order is flagged for refund instead of being silently confirmed.
 */
export async function markPaymentCaptured(p: { providerOrderId: string; providerPaymentId: string; amountPaise: number; currency: string; method?: string | undefined }): Promise<CaptureOutcome> {
  const outcome = await prisma.$transaction(async (tx): Promise<CaptureOutcome> => {
    const payment = await tx.payment.findUnique({ where: { providerOrderId: p.providerOrderId } });
    if (!payment) throw notFound("Payment");
    const order = await lockOrder(tx, payment.orderId);
    const fresh = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (fresh.status === PaymentStatus.CAPTURED || fresh.status === PaymentStatus.REFUNDED) return "already_processed";
    if (p.amountPaise !== fresh.amountPaise || p.currency !== "INR") {
      logger.error({ orderId: order.id, expected: fresh.amountPaise, got: p.amountPaise }, "Payment amount mismatch — not confirming order");
      throw conflict("The payment amount does not match the order.", "AMOUNT_MISMATCH");
    }
    await tx.payment.update({
      where: { id: fresh.id },
      data: { status: PaymentStatus.CAPTURED, providerPaymentId: p.providerPaymentId, capturedAt: new Date(), method: p.method ?? null, errorCode: null, errorDescription: null },
    });
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: OrderPaymentStatus.PAID, paidAt: new Date() } });
    order.paymentStatus = OrderPaymentStatus.PAID;

    if (order.status === OrderStatus.PENDING_PAYMENT) {
      await confirmOrder(tx, order, null, "Payment received");
      return "confirmed";
    }
    await tx.order.update({ where: { id: order.id }, data: { requiresRefund: true } });
    await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: order.status, toStatus: order.status, note: "Payment received after the order was closed — refund required" } });
    return "flagged_for_refund";
  });
  if (outcome === "confirmed") {
    const payment = await prisma.payment.findUnique({ where: { providerOrderId: p.providerOrderId }, select: { orderId: true } });
    if (payment) void notifyOrderConfirmed(payment.orderId);
  }
  return outcome;
}

export async function markPaymentFailed(providerOrderId: string, entity: Pick<RazorpayPayment, "id" | "error_code" | "error_description">): Promise<void> {
  await prisma.payment.updateMany({
    where: { providerOrderId, status: PaymentStatus.CREATED },
    data: { errorCode: entity.error_code ?? null, errorDescription: entity.error_description?.slice(0, 300) ?? null },
  });
}

/**
 * Handles the Checkout success callback. The signature proves the ids came from Razorpay; we
 * then fetch the payment from Razorpay to confirm it is captured for the right order and amount.
 */
export async function verifyCheckoutPayment(userId: string, body: { orderId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: body.razorpayOrderId }, include: { order: { select: { id: true, userId: true } } } });
  if (!payment || payment.order.userId !== userId || payment.order.id !== body.orderId) throw notFound("Payment");
  if (!verifyPaymentSignature(body.razorpayOrderId, body.razorpayPaymentId, body.razorpaySignature)) {
    throw badRequest("We couldn't verify this payment. If money was deducted, it will be confirmed or refunded automatically.", "INVALID_SIGNATURE");
  }
  let gw = await razorpay.fetchPayment(body.razorpayPaymentId);
  if (gw.order_id !== body.razorpayOrderId) throw badRequest("Payment does not belong to this order.", "PAYMENT_MISMATCH");
  if (gw.status === "authorized") gw = await razorpay.capturePayment(gw.id, payment.amountPaise);
  if (gw.status !== "captured") return { status: "pending" as const };
  const outcome = await markPaymentCaptured({ providerOrderId: gw.order_id, providerPaymentId: gw.id, amountPaise: gw.amount, currency: gw.currency, method: gw.method });
  return { status: outcome === "flagged_for_refund" ? ("refund_pending" as const) : ("paid" as const) };
}

// ───────────── Webhooks ─────────────

interface WebhookPayload {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayPayment };
    refund?: { entity?: { id: string; status: string } };
  };
}

/**
 * Processes a verified webhook delivery. The (provider, event id) unique key makes replays and
 * duplicate deliveries a no-op; processing is idempotent as well.
 */
export async function handleWebhook(eventId: string, rawBody: Buffer): Promise<"processed" | "duplicate" | "ignored"> {
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as WebhookPayload;
  } catch {
    throw badRequest("Invalid webhook body.", "INVALID_JSON");
  }
  const type = String(payload.event ?? "unknown");
  try {
    await prisma.webhookEvent.create({
      data: { provider: "razorpay", eventId, type, payloadHash: createHash("sha256").update(rawBody).digest("hex") },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: "razorpay", eventId } } });
      if (existing?.processedAt) return "duplicate";
      // A previous delivery was recorded but failed mid-way — process again (handlers are idempotent).
    } else throw err;
  }

  const payment = payload.payload?.payment?.entity;
  const refund = payload.payload?.refund?.entity;
  let handled = true;
  switch (type) {
    case "payment.captured":
    case "order.paid":
      if (!payment) break;
      await markPaymentCaptured({ providerOrderId: payment.order_id, providerPaymentId: payment.id, amountPaise: payment.amount, currency: payment.currency, method: payment.method }).catch(
        (err: unknown) => {
          if ((err as { code?: string }).code === "NOT_FOUND") return; // not one of our orders
          throw err;
        },
      );
      break;
    case "payment.failed":
      if (payment) await markPaymentFailed(payment.order_id, payment);
      break;
    case "refund.processed":
    case "refund.failed":
      if (refund) await applyRefundUpdate(refund.id, type === "refund.processed" ? "processed" : "failed");
      break;
    default:
      handled = false;
  }
  await prisma.webhookEvent.update({ where: { provider_eventId: { provider: "razorpay", eventId } }, data: { processedAt: new Date() } });
  return handled ? "processed" : "ignored";
}
