// Order lifecycle: guarded status transitions, confirmation, cancellation, returns and refunds.
import { canTransition, ORDER_STATUS_LABEL, CUSTOMER_CANCELLABLE } from "@shared/order-status";
import { formatINR } from "@shared/money";
import type { OrderDetailDTO, OrderSummaryDTO } from "@shared/types";
import { env, razorpayEnabled } from "../../config/env.ts";
import { audit } from "../../lib/audit.ts";
import { badRequest, conflict, notFound, serviceUnavailable } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { orderConfirmationEmail, sendMail } from "../../lib/mailer.ts";
import {
  InventoryMovementType,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RefundStatus,
  ReturnStatus,
  prisma,
  type Tx,
} from "../../lib/prisma.ts";
import { razorpay } from "../../lib/razorpay.ts";
import { commitReservedStock, releaseReservedStock, restock } from "../inventory/service.ts";

export const orderDetailInclude = {
  items: { orderBy: { id: "asc" } },
  events: { orderBy: { createdAt: "asc" } },
  shipment: true,
  returnRequests: { orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.OrderInclude;
export type OrderWithDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;
type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

const DAY_MS = 24 * 60 * 60 * 1000;

// ───────────── DTOs ─────────────

export function toOrderSummary(o: OrderWithItems): OrderSummaryDTO {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    totalPaise: o.totalPaise,
    itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
    createdAt: o.createdAt.toISOString(),
  };
}

export function returnWindowOpen(o: { status: OrderStatus; deliveredAt: Date | null }, now = new Date()): boolean {
  return o.status === OrderStatus.DELIVERED && o.deliveredAt !== null && now.getTime() - o.deliveredAt.getTime() <= env.RETURN_WINDOW_DAYS * DAY_MS;
}

export function toOrderDetail(o: OrderWithDetail): OrderDetailDTO {
  const latestReturn = o.returnRequests[0] ?? null;
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    ...toOrderSummary(o),
    email: o.email,
    phone: o.phone,
    items: o.items.map((i) => ({
      id: i.id,
      productSlug: i.productSlug,
      productName: i.productName,
      sku: i.sku,
      size: i.sizeLabel,
      color: i.colorName,
      imageUrl: i.imageUrl,
      unitPricePaise: i.unitPricePaise,
      quantity: i.quantity,
      lineTotalPaise: i.lineTotalPaise,
    })),
    subtotalPaise: o.subtotalPaise,
    discountPaise: o.discountPaise,
    shippingPaise: o.shippingPaise,
    couponCode: o.couponCode,
    shippingAddress: {
      fullName: o.shipName,
      phone: o.shipPhone,
      line1: o.shipLine1,
      line2: o.shipLine2,
      landmark: o.shipLandmark,
      city: o.shipCity,
      state: o.shipState,
      pincode: o.shipPincode,
    },
    shippingMethod: { code: o.shippingMethodCode, name: o.shippingMethodName, minDays: o.deliveryMinDays, maxDays: o.deliveryMaxDays },
    shipment: o.shipment
      ? {
          carrier: o.shipment.carrier,
          trackingNumber: o.shipment.trackingNumber,
          trackingUrl: o.shipment.trackingUrl,
          shippedAt: iso(o.shipment.shippedAt),
          deliveredAt: iso(o.shipment.deliveredAt),
        }
      : null,
    events: o.events.map((e) => ({ status: e.toStatus, note: e.note, createdAt: e.createdAt.toISOString() })),
    paidAt: iso(o.paidAt),
    cancelledAt: iso(o.cancelledAt),
    cancelReason: o.cancelReason,
    deliveredAt: iso(o.deliveredAt),
    reservationExpiresAt: iso(o.reservationExpiresAt),
    canCancel: CUSTOMER_CANCELLABLE.includes(o.status),
    canRequestReturn: returnWindowOpen(o) && !(latestReturn && latestReturn.status !== ReturnStatus.REJECTED),
    returnRequest: latestReturn ? { status: latestReturn.status, reason: latestReturn.reason, createdAt: latestReturn.createdAt.toISOString() } : null,
  };
}

// ───────────── Locking & transitions ─────────────

/** Row-locks the order for the rest of the transaction, serialising concurrent changes. */
export async function lockOrder(tx: Tx, orderId: string): Promise<OrderWithItems> {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw notFound("Order");
  return order;
}

interface TransitionOptions {
  actorId: string | null;
  note?: string | null;
  data?: Prisma.OrderUpdateManyMutationInput;
}

/**
 * The only way an order's status changes. Enforces the shared state graph, refuses to confirm
 * an unpaid online order, and uses an optimistic WHERE status = <current> so a stale update
 * can never overwrite a newer one.
 */
export async function transitionOrder(
  tx: Tx,
  order: { id: string; status: OrderStatus; paymentStatus: OrderPaymentStatus; paymentMethod: PaymentMethod },
  to: OrderStatus,
  { actorId, note = null, data = {} }: TransitionOptions,
): Promise<void> {
  if (!canTransition(order.status, to)) {
    throw conflict(`An order that is "${ORDER_STATUS_LABEL[order.status]}" cannot be changed to "${ORDER_STATUS_LABEL[to]}".`, "INVALID_TRANSITION");
  }
  const paidOrCod = order.paymentStatus === OrderPaymentStatus.PAID || order.paymentMethod === PaymentMethod.COD;
  if (to === OrderStatus.CONFIRMED && !paidOrCod) throw conflict("An order cannot be confirmed before it is paid.", "PAYMENT_REQUIRED");
  if (to === OrderStatus.REFUNDED && order.paymentStatus !== OrderPaymentStatus.REFUNDED) {
    throw conflict("Record the refund before marking the order refunded.", "REFUND_REQUIRED");
  }
  const result = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { ...data, status: to } });
  if (result.count !== 1) throw conflict("This order was just updated. Refresh and try again.", "STALE_ORDER");
  await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: order.status, toStatus: to, note, actorId } });
  order.status = to;
}

const byVariant = <T extends { variantId: string | null }>(items: T[]) =>
  [...items].filter((i): i is T & { variantId: string } => i.variantId !== null).sort((a, b) => a.variantId.localeCompare(b.variantId));

async function adjustSoldCounts(tx: Tx, items: OrderWithItems["items"], sign: 1 | -1) {
  const perProduct = new Map<string, number>();
  for (const i of items) if (i.productId) perProduct.set(i.productId, (perProduct.get(i.productId) ?? 0) + i.quantity);
  for (const [id, qty] of perProduct) {
    if (sign === 1) await tx.product.update({ where: { id }, data: { soldCount: { increment: qty } } });
    else await tx.$executeRaw`UPDATE "Product" SET "soldCount" = GREATEST(0, "soldCount" - ${qty}) WHERE "id" = ${id}`;
  }
}

/** Commits reserved stock and confirms the order. The order must already be paid or be cash on delivery. */
export async function confirmOrder(tx: Tx, order: OrderWithItems, actorId: string | null, note: string): Promise<void> {
  for (const item of byVariant(order.items)) await commitReservedStock(tx, item.variantId, item.quantity, order.id);
  await adjustSoldCounts(tx, order.items, 1);
  await transitionOrder(tx, order, OrderStatus.CONFIRMED, { actorId, note, data: { stockCommitted: true, reservationExpiresAt: null } });
}

/** Cancels inside a transaction: stock goes back, the coupon use is released, paid orders are flagged for refund. */
export async function cancelOrderTx(tx: Tx, order: OrderWithItems, actorId: string | null, reason: string): Promise<void> {
  if (!canTransition(order.status, OrderStatus.CANCELLED)) {
    throw conflict(`An order that is "${ORDER_STATUS_LABEL[order.status]}" can no longer be cancelled.`, "INVALID_TRANSITION");
  }
  if (order.stockCommitted) {
    for (const item of byVariant(order.items)) {
      await restock(tx, item.variantId, item.quantity, InventoryMovementType.CANCELLATION_RESTOCK, order.id, actorId, "Order cancelled");
    }
    await adjustSoldCounts(tx, order.items, -1);
  } else {
    for (const item of byVariant(order.items)) await releaseReservedStock(tx, item.variantId, item.quantity, order.id, "Order cancelled");
  }
  await tx.couponRedemption.deleteMany({ where: { orderId: order.id } });
  await transitionOrder(tx, order, OrderStatus.CANCELLED, {
    actorId,
    note: reason,
    data: {
      cancelledAt: new Date(),
      cancelReason: reason,
      stockCommitted: false,
      reservationExpiresAt: null,
      requiresRefund: order.paymentStatus === OrderPaymentStatus.PAID,
    },
  });
}

/** Cancels an order and, if it was paid online, starts the refund automatically. */
export async function cancelOrder(orderId: string, actorId: string | null, reason: string, opts: { customerId?: string } = {}) {
  const order = await prisma.$transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (opts.customerId) {
      if (o.userId !== opts.customerId) throw notFound("Order");
      if (!CUSTOMER_CANCELLABLE.includes(o.status)) throw conflict("This order is already being prepared and can no longer be cancelled online. Please contact us.", "NOT_CANCELLABLE");
    }
    await cancelOrderTx(tx, o, actorId, reason);
    if (actorId && !opts.customerId) await audit(tx, { actorId, action: "order.cancel", entityType: "Order", entityId: o.id, metadata: { reason } });
    return o;
  });
  if (order.paymentStatus === OrderPaymentStatus.PAID && order.paymentMethod === PaymentMethod.RAZORPAY && razorpayEnabled) {
    await refundOrder(order.id, actorId, { reason: `Cancelled: ${reason}` }).catch((err) =>
      logger.error({ err, orderId: order.id }, "Automatic refund failed — order left flagged for manual refund"),
    );
  }
}

// ───────────── Refunds ─────────────

async function finalizeRefund(tx: Tx, orderId: string, actorId: string | null) {
  const order = await lockOrder(tx, orderId);
  if (order.paymentStatus === OrderPaymentStatus.REFUNDED) return;
  await tx.order.update({ where: { id: order.id }, data: { paymentStatus: OrderPaymentStatus.REFUNDED, requiresRefund: false } });
  await tx.payment.updateMany({ where: { orderId: order.id, status: PaymentStatus.CAPTURED }, data: { status: PaymentStatus.REFUNDED } });
  order.paymentStatus = OrderPaymentStatus.REFUNDED;
  if (order.status === OrderStatus.RETURNED) {
    await transitionOrder(tx, order, OrderStatus.REFUNDED, { actorId, note: "Refund processed" });
    await tx.returnRequest.updateMany({ where: { orderId: order.id, status: ReturnStatus.RECEIVED }, data: { status: ReturnStatus.REFUNDED, resolvedAt: new Date() } });
  } else {
    await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: order.status, toStatus: order.status, note: "Refund processed", actorId } });
  }
}

/**
 * Refunds the full amount of a cancelled or returned paid order. Online payments are refunded
 * through Razorpay; cash-on-delivery refunds happen outside the system, so staff must record
 * the bank-transfer/UPI reference — nothing is marked refunded without evidence.
 */
export async function refundOrder(orderId: string, actorId: string | null, opts: { manualReference?: string; reason?: string } = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, refunds: true } });
  if (!order) throw notFound("Order");
  if (order.paymentStatus !== OrderPaymentStatus.PAID) throw conflict("Only paid orders can be refunded.", "NOT_REFUNDABLE");
  if (order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.RETURNED) {
    throw conflict("Refunds are issued for cancelled orders or received returns.", "NOT_REFUNDABLE");
  }
  if (order.refunds.some((r) => r.status === RefundStatus.PENDING || r.status === RefundStatus.PROCESSED)) {
    throw conflict("A refund has already been started for this order.", "REFUND_EXISTS");
  }
  const reason = opts.reason ?? null;

  if (order.paymentMethod === PaymentMethod.RAZORPAY) {
    if (!razorpayEnabled) throw serviceUnavailable("Online payments are not configured, so the refund cannot be sent.", "PAYMENTS_NOT_CONFIGURED");
    const payment = order.payments.find((p) => p.status === PaymentStatus.CAPTURED && p.providerPaymentId);
    if (!payment?.providerPaymentId) throw conflict("No captured payment was found for this order.", "NO_PAYMENT");
    const rf = await razorpay.createRefund(payment.providerPaymentId, order.totalPaise, { orderNumber: order.orderNumber });
    await prisma.$transaction(async (tx) => {
      await tx.refund.create({
        data: {
          orderId: order.id,
          paymentId: payment.id,
          amountPaise: order.totalPaise,
          providerRefundId: rf.id,
          status: rf.status === "processed" ? RefundStatus.PROCESSED : rf.status === "failed" ? RefundStatus.FAILED : RefundStatus.PENDING,
          reason,
          actorId,
        },
      });
      if (rf.status === "processed") await finalizeRefund(tx, order.id, actorId);
      if (actorId) await audit(tx, { actorId, action: "order.refund", entityType: "Order", entityId: order.id, metadata: { amountPaise: order.totalPaise, providerRefundId: rf.id } });
    });
    return;
  }

  const ref = opts.manualReference?.trim();
  if (!ref) throw badRequest("Enter the bank transfer or UPI reference for this cash-on-delivery refund.", "REFERENCE_REQUIRED");
  await prisma.$transaction(async (tx) => {
    await tx.refund.create({ data: { orderId: order.id, amountPaise: order.totalPaise, status: RefundStatus.PROCESSED, manualReference: ref, reason, actorId } });
    await finalizeRefund(tx, order.id, actorId);
    await audit(tx, { actorId, action: "order.refund.manual", entityType: "Order", entityId: order.id, metadata: { amountPaise: order.totalPaise, reference: ref } });
  });
}

/** Called from the payment webhook when Razorpay reports a refund outcome. */
export async function applyRefundUpdate(providerRefundId: string, status: "processed" | "failed") {
  const refund = await prisma.refund.findUnique({ where: { providerRefundId } });
  if (!refund || refund.status !== RefundStatus.PENDING) return;
  await prisma.$transaction(async (tx) => {
    await tx.refund.update({ where: { id: refund.id }, data: { status: status === "processed" ? RefundStatus.PROCESSED : RefundStatus.FAILED } });
    if (status === "processed") await finalizeRefund(tx, refund.orderId, null);
  });
}

// ───────────── Returns ─────────────

export async function requestReturn(userId: string, orderId: string, input: { reason: string; details?: string | undefined }) {
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.userId !== userId) throw notFound("Order");
    if (!returnWindowOpen(order)) throw conflict(`Returns can be requested within ${env.RETURN_WINDOW_DAYS} days of delivery.`, "RETURN_WINDOW_CLOSED");
    const open = await tx.returnRequest.findFirst({ where: { orderId, status: { in: [ReturnStatus.REQUESTED, ReturnStatus.APPROVED, ReturnStatus.RECEIVED] } } });
    if (open) throw conflict("A return is already open for this order.", "RETURN_EXISTS");
    await tx.returnRequest.create({ data: { orderId, userId, reason: input.reason, details: input.details ?? null } });
    await transitionOrder(tx, order, OrderStatus.RETURN_REQUESTED, { actorId: userId, note: "Return requested by customer" });
  });
}

export async function resolveReturn(returnId: string, actorId: string, action: "approve" | "reject" | "receive", adminNote?: string) {
  await prisma.$transaction(async (tx) => {
    const rr = await tx.returnRequest.findUnique({ where: { id: returnId } });
    if (!rr) throw notFound("Return request");
    const order = await lockOrder(tx, rr.orderId);
    const note = adminNote?.trim() || null;
    if (action === "approve") {
      if (rr.status !== ReturnStatus.REQUESTED) throw conflict("Only new return requests can be approved.", "INVALID_RETURN_STATE");
      await tx.returnRequest.update({ where: { id: rr.id }, data: { status: ReturnStatus.APPROVED, adminNote: note } });
    } else if (action === "reject") {
      if (rr.status !== ReturnStatus.REQUESTED && rr.status !== ReturnStatus.APPROVED) throw conflict("This return can no longer be rejected.", "INVALID_RETURN_STATE");
      await tx.returnRequest.update({ where: { id: rr.id }, data: { status: ReturnStatus.REJECTED, adminNote: note, resolvedAt: new Date() } });
      await transitionOrder(tx, order, OrderStatus.DELIVERED, { actorId, note: note ?? "Return request declined" });
    } else {
      if (rr.status !== ReturnStatus.APPROVED) throw conflict("Approve the return before marking it received.", "INVALID_RETURN_STATE");
      for (const item of byVariant(order.items)) {
        await restock(tx, item.variantId, item.quantity, InventoryMovementType.RETURN_RESTOCK, order.id, actorId, "Return received");
      }
      await adjustSoldCounts(tx, order.items, -1);
      await tx.returnRequest.update({ where: { id: rr.id }, data: { status: ReturnStatus.RECEIVED, adminNote: note ?? rr.adminNote } });
      await transitionOrder(tx, order, OrderStatus.RETURNED, {
        actorId,
        note: "Return received",
        data: { requiresRefund: order.paymentStatus === OrderPaymentStatus.PAID },
      });
    }
    await audit(tx, { actorId, action: `return.${action}`, entityType: "ReturnRequest", entityId: rr.id, metadata: { orderId: order.id } });
  });
}

// ───────────── Notifications ─────────────

/** Best-effort confirmation email; failures are logged and never affect the order. */
export async function notifyOrderConfirmed(orderId: string): Promise<void> {
  try {
    const o = await prisma.order.findUnique({ where: { id: orderId }, include: { user: { select: { name: true } } } });
    if (!o) return;
    const link = `${env.STOREFRONT_URL.replace(/\/$/, "")}/account/orders/${o.id}`;
    await sendMail(orderConfirmationEmail(o.email, o.user.name, o.orderNumber, formatINR(o.totalPaise), link));
  } catch (err) {
    logger.warn({ err, orderId }, "Order confirmation email failed");
  }
}
