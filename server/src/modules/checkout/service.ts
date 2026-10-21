// Checkout: everything — prices, discounts, shipping, stock — is recalculated on the server.
import { randomInt } from "node:crypto";
import type { CheckoutQuoteDTO, CheckoutResultDTO, ShippingMethodDTO } from "@shared/types";
import { shippingFee } from "@shared/pricing";
import type { z } from "zod";
import type { checkoutSchema } from "@shared/validation";
import { env, razorpayEnabled } from "../../config/env.ts";
import { badRequest, conflict, notFound, serviceUnavailable } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma, prisma, type Tx } from "../../lib/prisma.ts";
import { razorpay } from "../../lib/razorpay.ts";
import type { AuthUser } from "../../types/express.d.ts";
import { cartItemInclude, isSellable, toCartItem, unitPriceOf, type CartItemRow } from "../cart/service.ts";
import { evaluateCoupon } from "../coupons/service.ts";
import { reserveStock } from "../inventory/service.ts";
import { cancelOrder, confirmOrder, lockOrder, notifyOrderConfirmed, orderDetailInclude, toOrderDetail } from "../orders/service.ts";

type CheckoutData = z.output<typeof checkoutSchema>;

export const toShippingMethod = (m: {
  code: string;
  name: string;
  description: string | null;
  feePaise: number;
  freeAbovePaise: number | null;
  minDays: number;
  maxDays: number;
  codAllowed: boolean;
}): ShippingMethodDTO => ({
  code: m.code,
  name: m.name,
  description: m.description,
  feePaise: m.feePaise,
  freeAbovePaise: m.freeAbovePaise,
  minDays: m.minDays,
  maxDays: m.maxDays,
  codAllowed: m.codAllowed,
});

export async function activeShippingMethods(): Promise<ShippingMethodDTO[]> {
  const rows = await prisma.shippingMethod.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { feePaise: "asc" }] });
  return rows.map(toShippingMethod);
}

function assertPurchasable(items: CartItemRow[]) {
  if (!items.length) throw badRequest("Your bag is empty.", "CART_EMPTY");
  const problems = items.map(toCartItem).filter((i) => i.issue !== null);
  if (problems.length) {
    throw conflict(
      `Please update your bag: ${problems.map((p) => `${p.productName} (${p.size})`).join(", ")} ${problems.length === 1 ? "is" : "are"} no longer available as selected.`,
      "CART_NEEDS_ATTENTION",
    );
  }
}

/** Price preview for the checkout page. Never trusted at order time — placeOrder recomputes it. */
export async function quote(user: AuthUser, input: { shippingMethodCode?: string | undefined; couponCode?: string | undefined }): Promise<CheckoutQuoteDTO> {
  const cart = await prisma.cart.findUnique({ where: { userId: user.id }, select: { items: { include: cartItemInclude } } });
  const items = (cart?.items ?? []).filter(isSellable);
  const subtotalPaise = items.reduce((s, i) => s + unitPriceOf(i) * i.quantity, 0);
  let discountPaise = 0;
  let coupon: CheckoutQuoteDTO["coupon"] = null;
  let couponError: string | null = null;
  if (input.couponCode) {
    const result = await evaluateCoupon(prisma, input.couponCode, user.id, subtotalPaise);
    if (result.ok) {
      discountPaise = result.discountPaise;
      coupon = { code: result.coupon.code, description: result.coupon.description };
    } else couponError = result.message;
  }
  const method = input.shippingMethodCode ? await prisma.shippingMethod.findFirst({ where: { code: input.shippingMethodCode, isActive: true } }) : null;
  const shippingPaise = method && subtotalPaise > 0 ? shippingFee(method, subtotalPaise - discountPaise) : 0;
  return {
    subtotalPaise,
    discountPaise,
    shippingPaise,
    totalPaise: subtotalPaise - discountPaise + shippingPaise,
    coupon,
    couponError,
    shippingMethod: method ? toShippingMethod(method) : null,
  };
}

const ORDER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function orderNumber(now = new Date()): string {
  const ymd = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += ORDER_ALPHABET[randomInt(ORDER_ALPHABET.length)];
  return `AEZ-${ymd}-${suffix}`;
}

/**
 * Places an order. In one transaction: locks the cart (so a double-click cannot create two
 * orders), re-reads prices, validates the coupon under a row lock, reserves stock with
 * conditional updates (no overselling), records the coupon use and clears the cart.
 * Cash-on-delivery orders are confirmed immediately; online orders wait for verified payment.
 */
export async function placeOrder(user: AuthUser, input: CheckoutData): Promise<CheckoutResultDTO> {
  const method = await prisma.shippingMethod.findFirst({ where: { code: input.shippingMethodCode, isActive: true } });
  if (!method) throw badRequest("Choose a delivery option.", "INVALID_SHIPPING_METHOD");

  if (input.paymentMethod === "RAZORPAY" && !razorpayEnabled) {
    throw serviceUnavailable("Online payment isn't available yet. Please choose another payment method.", "PAYMENTS_NOT_CONFIGURED");
  }
  if (input.paymentMethod === "COD" && (!env.COD_ENABLED || !method.codAllowed)) {
    throw badRequest("Cash on delivery isn't available for this order.", "COD_UNAVAILABLE");
  }

  let address = input.address ?? null;
  if (input.addressId) {
    const saved = await prisma.address.findFirst({ where: { id: input.addressId, userId: user.id } });
    if (!saved) throw notFound("Address");
    address = { ...saved, line2: saved.line2 ?? undefined, landmark: saved.landmark ?? undefined, state: saved.state as NonNullable<typeof address>["state"] };
  }
  if (!address) throw badRequest("Enter a delivery address.", "ADDRESS_REQUIRED");
  const addr = address;

  const create = async (tx: Tx) => {
    const cart = await tx.cart.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!cart) throw badRequest("Your bag is empty.", "CART_EMPTY");
    await tx.$queryRaw`SELECT "id" FROM "Cart" WHERE "id" = ${cart.id} FOR UPDATE`;
    const items = await tx.cartItem.findMany({ where: { cartId: cart.id }, include: cartItemInclude, orderBy: { variantId: "asc" } });
    assertPurchasable(items);

    const lines = items.map((i) => ({ row: i, unit: unitPriceOf(i) }));
    const subtotalPaise = lines.reduce((s, l) => s + l.unit * l.row.quantity, 0);

    let discountPaise = 0;
    let couponId: string | null = null;
    let couponCode: string | null = null;
    if (input.couponCode) {
      const result = await evaluateCoupon(tx, input.couponCode, user.id, subtotalPaise, tx);
      if (!result.ok) throw conflict(result.message, "COUPON_INVALID");
      discountPaise = result.discountPaise;
      couponId = result.coupon.id;
      couponCode = result.coupon.code;
    }
    const shippingPaise = shippingFee(method, subtotalPaise - discountPaise);
    const totalPaise = subtotalPaise - discountPaise + shippingPaise;
    const online = input.paymentMethod === "RAZORPAY";

    const order = await tx.order.create({
      data: {
        orderNumber: orderNumber(),
        userId: user.id,
        status: OrderStatus.PENDING_PAYMENT,
        paymentMethod: online ? PaymentMethod.RAZORPAY : PaymentMethod.COD,
        email: input.contact.email,
        phone: input.contact.phone,
        shipName: addr.fullName,
        shipPhone: addr.phone,
        shipLine1: addr.line1,
        shipLine2: addr.line2 ?? null,
        shipLandmark: addr.landmark ?? null,
        shipCity: addr.city,
        shipState: addr.state,
        shipPincode: addr.pincode,
        shippingMethodCode: method.code,
        shippingMethodName: method.name,
        deliveryMinDays: method.minDays,
        deliveryMaxDays: method.maxDays,
        subtotalPaise,
        discountPaise,
        shippingPaise,
        totalPaise,
        couponCode,
        reservationExpiresAt: online ? new Date(Date.now() + env.PAYMENT_TIMEOUT_MINUTES * 60_000) : null,
        items: {
          create: lines.map(({ row, unit }) => {
            const p = row.variant.product;
            const image = p.images.find((im) => im.colorId === row.variant.colorId) ?? p.images[0];
            return {
              productId: p.id,
              variantId: row.variantId,
              productName: p.name,
              productSlug: p.slug,
              sku: row.variant.sku,
              sizeLabel: row.variant.size.label,
              colorName: row.variant.color.name,
              imageUrl: image?.url ?? null,
              unitPricePaise: unit,
              quantity: row.quantity,
              lineTotalPaise: unit * row.quantity,
            };
          }),
        },
        events: { create: { toStatus: OrderStatus.PENDING_PAYMENT, note: "Order placed", actorId: user.id } },
        payments: { create: { provider: online ? PaymentMethod.RAZORPAY : PaymentMethod.COD, amountPaise: totalPaise, status: PaymentStatus.CREATED } },
      },
      include: { items: true },
    });

    for (const { row } of lines) await reserveStock(tx, row.variantId, row.quantity, order.id);
    if (couponId) await tx.couponRedemption.create({ data: { couponId, userId: user.id, orderId: order.id, discountPaise } });
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    if (input.saveAddress && input.address) {
      const hasDefault = await tx.address.count({ where: { userId: user.id, isDefault: true } });
      await tx.address.create({
        data: { userId: user.id, ...input.address, line2: input.address.line2 ?? null, landmark: input.address.landmark ?? null, isDefault: hasDefault === 0 },
      });
    }
    if (!online) {
      const locked = await lockOrder(tx, order.id);
      await confirmOrder(tx, locked, null, "Cash on delivery order confirmed");
    }
    return order;
  };

  let order: Awaited<ReturnType<typeof create>> | undefined;
  for (let attempt = 0; attempt < 3 && !order; attempt++) {
    try {
      order = await prisma.$transaction(create, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000, maxWait: 10_000 });
    } catch (err) {
      // Retry only the (astronomically rare) order-number collision.
      const target = (err as { code?: string; meta?: { target?: unknown } }).code === "P2002" ? JSON.stringify((err as { meta?: unknown }).meta ?? "") : "";
      if (!target.includes("orderNumber")) throw err;
    }
  }
  if (!order) throw new Error("Could not allocate an order number");

  let razorpayParams: CheckoutResultDTO["razorpay"] = null;
  if (order.paymentMethod === PaymentMethod.RAZORPAY) {
    try {
      razorpayParams = await ensureGatewayOrder(order.id);
    } catch (err) {
      await cancelOrder(order.id, null, "Payment could not be started").catch((e) => logger.error({ err: e, orderId: order.id }, "Failed to cancel order after gateway error"));
      throw err;
    }
  } else {
    void notifyOrderConfirmed(order.id);
  }

  const detail = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: orderDetailInclude });
  return { order: toOrderDetail(detail), razorpay: razorpayParams };
}

/** Creates (or reuses) the Razorpay order for an unpaid order and returns Checkout parameters. */
export async function ensureGatewayOrder(orderId: string, userId?: string): Promise<NonNullable<CheckoutResultDTO["razorpay"]>> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: { orderBy: { createdAt: "desc" } } } });
  if (!order || (userId && order.userId !== userId)) throw notFound("Order");
  if (order.paymentMethod !== PaymentMethod.RAZORPAY) throw badRequest("This order is not paid online.", "NOT_ONLINE_PAYMENT");
  if (order.status !== OrderStatus.PENDING_PAYMENT) throw conflict("This order no longer needs payment.", "PAYMENT_NOT_NEEDED");
  if (!razorpayEnabled || !env.RAZORPAY_KEY_ID) throw serviceUnavailable("Online payment isn't available yet.", "PAYMENTS_NOT_CONFIGURED");

  let payment = order.payments.find((p) => p.status === PaymentStatus.CREATED);
  if (!payment) payment = await prisma.payment.create({ data: { orderId: order.id, provider: PaymentMethod.RAZORPAY, amountPaise: order.totalPaise } });
  let providerOrderId = payment.providerOrderId;
  if (!providerOrderId) {
    const gw = await razorpay.createOrder(order.totalPaise, order.orderNumber, { orderId: order.id, orderNumber: order.orderNumber });
    if (gw.amount !== order.totalPaise || gw.currency !== "INR") throw new Error("Gateway order amount mismatch");
    providerOrderId = gw.id;
    await prisma.payment.update({ where: { id: payment.id }, data: { providerOrderId } });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: order.userId }, select: { name: true } });
  return { keyId: env.RAZORPAY_KEY_ID, orderId: providerOrderId, amountPaise: order.totalPaise, currency: "INR", name: user.name, email: order.email, phone: order.phone };
}
