import { Router } from "express";
import { z } from "zod";
import { adminCanSet, ADMIN_MANUAL_TRANSITIONS, ORDER_STATUSES, type OrderStatus as SharedOrderStatus } from "@shared/order-status";
import { audit } from "../../lib/audit.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { ok, pageMeta, parse, param } from "../../lib/http.ts";
import { OrderPaymentStatus, OrderStatus, PaymentMethod, PaymentStatus, Prisma, ReturnStatus, ReviewStatus, prisma } from "../../lib/prisma.ts";
import { currentUser, requirePermission } from "../../middleware/auth.ts";
import { refreshRating } from "../catalog/reviews.ts";
import { invalidateCatalogCache } from "../catalog/service.ts";
import { adjustStock } from "../inventory/service.ts";
import { cancelOrder, lockOrder, orderDetailInclude, refundOrder, resolveReturn, toOrderDetail, transitionOrder } from "../orders/service.ts";
import { couponInputSchema, listQuerySchema, orderStatusSchema, shipmentSchema, shippingMethodSchema, stockAdjustSchema } from "./schemas.ts";

export const adminOpsRouter = Router();

// ───────────── Dashboard ─────────────

adminOpsRouter.get("/dashboard", async (_req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [ordersTotal, awaitingPayment, toFulfil, revenue, products, lowStock, outOfStock, recent, requiresRefund, openReturns, trend] = await Promise.all([
    prisma.order.count({ where: { status: { not: OrderStatus.PENDING_PAYMENT } } }),
    prisma.order.count({ where: { status: OrderStatus.PENDING_PAYMENT } }),
    prisma.order.count({ where: { status: { in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.PACKED] } } }),
    // Revenue counts only payments confirmed by the gateway (or COD cash recorded as collected).
    prisma.order.aggregate({ where: { paymentStatus: OrderPaymentStatus.PAID }, _sum: { totalPaise: true }, _count: { _all: true } }),
    prisma.product.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "Inventory" i JOIN "ProductVariant" v ON v."id" = i."variantId"
      WHERE v."isActive" AND i."onHand" - i."reserved" > 0 AND i."onHand" - i."reserved" <= i."lowStockThreshold"`,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "Inventory" i JOIN "ProductVariant" v ON v."id" = i."variantId"
      WHERE v."isActive" AND i."onHand" - i."reserved" <= 0`,
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { items: true, user: { select: { name: true } } } }),
    prisma.order.count({ where: { requiresRefund: true } }),
    prisma.returnRequest.count({ where: { status: { in: [ReturnStatus.REQUESTED, ReturnStatus.APPROVED, ReturnStatus.RECEIVED] } } }),
    prisma.$queryRaw<{ day: Date; revenue: bigint; orders: bigint }[]>`
      SELECT date_trunc('day', "paidAt" AT TIME ZONE 'Asia/Kolkata') AS day, SUM("totalPaise")::bigint AS revenue, COUNT(*)::bigint AS orders
      FROM "Order" WHERE "paymentStatus" = 'PAID' AND "paidAt" >= ${since} GROUP BY 1 ORDER BY 1`,
  ]);
  res.json(
    ok({
      orders: { total: ordersTotal, awaitingPayment, toFulfil, requiresRefund, openReturns },
      revenue: { paidPaise: revenue._sum.totalPaise ?? 0, paidOrders: revenue._count._all },
      products: Object.fromEntries(products.map((p) => [p.status, p._count._all])),
      stock: { lowStockVariants: Number(lowStock[0]?.count ?? 0), outOfStockVariants: Number(outOfStock[0]?.count ?? 0) },
      recentOrders: recent.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.user.name,
        status: o.status,
        paymentStatus: o.paymentStatus,
        totalPaise: o.totalPaise,
        createdAt: o.createdAt.toISOString(),
      })),
      // Empty until there are verified paid orders — the UI shows nothing rather than a fake chart.
      salesTrend: trend.map((t) => ({ day: t.day.toISOString().slice(0, 10), revenuePaise: Number(t.revenue), orders: Number(t.orders) })),
    }),
  );
});

// ───────────── Inventory ─────────────

adminOpsRouter.get("/inventory", async (req, res) => {
  const q = parse(listQuerySchema.extend({ filter: z.enum(["all", "low", "out"]).default("all") }), req.query);
  const search = q.q ? `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const stockFilter =
    q.filter === "low"
      ? Prisma.sql`AND i."onHand" - i."reserved" > 0 AND i."onHand" - i."reserved" <= i."lowStockThreshold"`
      : q.filter === "out"
        ? Prisma.sql`AND i."onHand" - i."reserved" <= 0`
        : Prisma.empty;
  const searchFilter = search ? Prisma.sql`AND (p."name" ILIKE ${search} OR v."sku" ILIKE ${search})` : Prisma.empty;
  const offset = (q.page - 1) * q.pageSize;
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<
      { variantId: string; sku: string; productId: string; productName: string; size: string; color: string; isActive: boolean; onHand: number; reserved: number; lowStockThreshold: number }[]
    >`
      SELECT v."id" AS "variantId", v."sku", p."id" AS "productId", p."name" AS "productName", s."label" AS "size", c."name" AS "color",
             v."isActive", i."onHand", i."reserved", i."lowStockThreshold"
      FROM "Inventory" i
      JOIN "ProductVariant" v ON v."id" = i."variantId"
      JOIN "Product" p ON p."id" = v."productId"
      JOIN "Size" s ON s."id" = v."sizeId"
      JOIN "Color" c ON c."id" = v."colorId"
      WHERE p."status" <> 'ARCHIVED' ${stockFilter} ${searchFilter}
      ORDER BY (i."onHand" - i."reserved") ASC, p."name" ASC, s."sortOrder" ASC
      LIMIT ${q.pageSize} OFFSET ${offset}`,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "Inventory" i
      JOIN "ProductVariant" v ON v."id" = i."variantId" JOIN "Product" p ON p."id" = v."productId"
      WHERE p."status" <> 'ARCHIVED' ${stockFilter} ${searchFilter}`,
  ]);
  res.json({ data: rows.map((r) => ({ ...r, available: r.onHand - r.reserved })), meta: pageMeta(q.page, q.pageSize, Number(count[0]?.count ?? 0)) });
});

adminOpsRouter.post("/inventory/:variantId/adjust", requirePermission("inventory:write"), async (req, res) => {
  const actor = currentUser(req);
  const { delta, reason } = parse(stockAdjustSchema, req.body);
  const inventory = await prisma.$transaction(async (tx) => {
    const inv = await adjustStock(tx, param(req, "variantId"), delta, actor.id, reason);
    await audit(tx, { actorId: actor.id, action: "inventory.adjust", entityType: "ProductVariant", entityId: param(req, "variantId"), metadata: { delta, reason } });
    return inv;
  });
  invalidateCatalogCache();
  res.json(ok(inventory));
});

adminOpsRouter.patch("/inventory/:variantId", requirePermission("inventory:write"), async (req, res) => {
  const { lowStockThreshold } = parse(z.object({ lowStockThreshold: z.number().int().min(0).max(1000) }), req.body);
  res.json(ok(await prisma.inventory.update({ where: { variantId: param(req, "variantId") }, data: { lowStockThreshold } })));
});

adminOpsRouter.get("/inventory/:variantId/movements", async (req, res) => {
  const rows = await prisma.inventoryMovement.findMany({
    where: { variantId: param(req, "variantId") },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true } }, order: { select: { orderNumber: true } } },
  });
  res.json(ok(rows.map((m) => ({ id: m.id, type: m.type, onHandDelta: m.onHandDelta, reservedDelta: m.reservedDelta, reason: m.reason, orderNumber: m.order?.orderNumber ?? null, actor: m.actor?.name ?? null, createdAt: m.createdAt.toISOString() }))));
});

// ───────────── Orders ─────────────

adminOpsRouter.get("/orders", requirePermission("orders:read"), async (req, res) => {
  const q = parse(listQuerySchema.extend({ requiresRefund: z.enum(["1"]).optional() }), req.query);
  const where: Prisma.OrderWhereInput = {
    ...(q.status && (ORDER_STATUSES as readonly string[]).includes(q.status) ? { status: q.status as OrderStatus } : {}),
    ...(q.requiresRefund ? { requiresRefund: true } : {}),
    ...(q.q
      ? { OR: [{ orderNumber: { contains: q.q.toUpperCase() } }, { email: { contains: q.q.toLowerCase() } }, { phone: { contains: q.q } }, { shipName: { contains: q.q, mode: "insensitive" } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { items: true, user: { select: { name: true } } } }),
    prisma.order.count({ where }),
  ]);
  res.json({
    data: rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customer: o.user.name,
      email: o.email,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      totalPaise: o.totalPaise,
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
      requiresRefund: o.requiresRefund,
      createdAt: o.createdAt.toISOString(),
    })),
    meta: pageMeta(q.page, q.pageSize, total),
  });
});

async function adminOrderDetail(id: string) {
  const o = await prisma.order.findUnique({
    where: { id },
    include: { ...orderDetailInclude, user: { select: { id: true, name: true, email: true } }, payments: { orderBy: { createdAt: "asc" } }, refunds: { orderBy: { createdAt: "asc" } } },
  });
  if (!o) throw notFound("Order");
  return {
    ...toOrderDetail(o),
    customer: o.user,
    requiresRefund: o.requiresRefund,
    allowedStatuses: (ADMIN_MANUAL_TRANSITIONS[o.status as SharedOrderStatus] ?? []).filter((s) => s !== "SHIPPED" || o.shipment),
    payments: o.payments.map((p) => ({ id: p.id, provider: p.provider, status: p.status, amountPaise: p.amountPaise, providerPaymentId: p.providerPaymentId, method: p.method, errorDescription: p.errorDescription, capturedAt: p.capturedAt?.toISOString() ?? null })),
    refunds: o.refunds.map((r) => ({ id: r.id, status: r.status, amountPaise: r.amountPaise, providerRefundId: r.providerRefundId, manualReference: r.manualReference, createdAt: r.createdAt.toISOString() })),
    returnRequests: o.returnRequests,
  };
}

adminOpsRouter.get("/orders/:id", requirePermission("orders:read"), async (req, res) => {
  res.json(ok(await adminOrderDetail(param(req, "id"))));
});

adminOpsRouter.post("/orders/:id/status", requirePermission("orders:write"), async (req, res) => {
  const actor = currentUser(req);
  const { status, note } = parse(orderStatusSchema, req.body);
  if (status === OrderStatus.CANCELLED) {
    await cancelOrder(param(req, "id"), actor.id, note || "Cancelled by store");
    return void res.json(ok(await adminOrderDetail(param(req, "id"))));
  }
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, param(req, "id"));
    if (!adminCanSet(order.status, status)) throw conflict("That status change isn't allowed from the order's current status.", "INVALID_TRANSITION");
    const shipment = await tx.shipment.findUnique({ where: { orderId: order.id } });
    if (status === OrderStatus.SHIPPED && !shipment) throw badRequest("Add the courier and tracking details to mark the order shipped.", "SHIPMENT_REQUIRED");
    const now = new Date();
    if (status === OrderStatus.SHIPPED && shipment) await tx.shipment.update({ where: { id: shipment.id }, data: { shippedAt: shipment.shippedAt ?? now } });
    if (status === OrderStatus.DELIVERED && shipment) await tx.shipment.update({ where: { id: shipment.id }, data: { deliveredAt: now } });
    await transitionOrder(tx, order, status, { actorId: actor.id, note: note || null, data: status === OrderStatus.DELIVERED ? { deliveredAt: now } : {} });
    await audit(tx, { actorId: actor.id, action: "order.status", entityType: "Order", entityId: order.id, metadata: { to: status, note: note ?? null } });
  });
  res.json(ok(await adminOrderDetail(param(req, "id"))));
});

/** Saves courier details; if the order is packed, also marks it shipped. */
adminOpsRouter.post("/orders/:id/shipment", requirePermission("orders:write"), async (req, res) => {
  const actor = currentUser(req);
  const input = parse(shipmentSchema, req.body);
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, param(req, "id"));
    if (!([OrderStatus.PACKED, OrderStatus.SHIPPED] as OrderStatus[]).includes(order.status)) throw conflict("Pack the order before adding shipment details.", "INVALID_TRANSITION");
    const now = new Date();
    await tx.shipment.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, carrier: input.carrier, trackingNumber: input.trackingNumber, trackingUrl: input.trackingUrl, shippedAt: now },
      update: { carrier: input.carrier, trackingNumber: input.trackingNumber, trackingUrl: input.trackingUrl },
    });
    if (order.status === OrderStatus.PACKED) await transitionOrder(tx, order, OrderStatus.SHIPPED, { actorId: actor.id, note: `Shipped with ${input.carrier}` });
    await audit(tx, { actorId: actor.id, action: "order.shipment", entityType: "Order", entityId: order.id, metadata: { carrier: input.carrier, trackingNumber: input.trackingNumber } });
  });
  res.json(ok(await adminOrderDetail(param(req, "id"))));
});

/** Records cash collected for a cash-on-delivery order — the only manual way an order becomes paid. */
adminOpsRouter.post("/orders/:id/cod-collected", requirePermission("orders:write"), async (req, res) => {
  const actor = currentUser(req);
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, param(req, "id"));
    if (order.paymentMethod !== PaymentMethod.COD) throw badRequest("Only cash-on-delivery orders can be marked as collected.", "NOT_COD");
    if (order.paymentStatus === OrderPaymentStatus.PAID) throw conflict("Payment is already recorded for this order.", "ALREADY_PAID");
    if (!([OrderStatus.SHIPPED, OrderStatus.DELIVERED] as OrderStatus[]).includes(order.status)) throw conflict("Cash can be recorded once the order is out for delivery.", "INVALID_TRANSITION");
    const now = new Date();
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: OrderPaymentStatus.PAID, paidAt: now } });
    await tx.payment.updateMany({ where: { orderId: order.id, provider: PaymentMethod.COD, status: PaymentStatus.CREATED }, data: { status: PaymentStatus.CAPTURED, capturedAt: now } });
    await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: order.status, toStatus: order.status, note: "Cash on delivery collected", actorId: actor.id } });
    await audit(tx, { actorId: actor.id, action: "order.cod_collected", entityType: "Order", entityId: order.id, metadata: { amountPaise: order.totalPaise } });
  });
  res.json(ok(await adminOrderDetail(param(req, "id"))));
});

adminOpsRouter.post("/orders/:id/refund", requirePermission("refunds:write"), async (req, res) => {
  const actor = currentUser(req);
  const { manualReference, reason } = parse(z.object({ manualReference: z.string().trim().max(120).optional(), reason: z.string().trim().max(300).optional() }), req.body ?? {});
  await refundOrder(param(req, "id"), actor.id, { ...(manualReference ? { manualReference } : {}), ...(reason ? { reason } : {}) });
  res.json(ok(await adminOrderDetail(param(req, "id"))));
});

// ───────────── Returns ─────────────

adminOpsRouter.get("/returns", requirePermission("orders:read"), async (req, res) => {
  const q = parse(listQuerySchema, req.query);
  const where: Prisma.ReturnRequestWhereInput = q.status && Object.values(ReturnStatus).includes(q.status as ReturnStatus) ? { status: q.status as ReturnStatus } : {};
  const [rows, total] = await Promise.all([
    prisma.returnRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { order: { select: { orderNumber: true, totalPaise: true, paymentMethod: true, paymentStatus: true } }, user: { select: { name: true, email: true } } } }),
    prisma.returnRequest.count({ where }),
  ]);
  res.json({ data: rows, meta: pageMeta(q.page, q.pageSize, total) });
});

adminOpsRouter.post("/returns/:id/:action", requirePermission("returns:write"), async (req, res) => {
  const actor = currentUser(req);
  const action = parse(z.enum(["approve", "reject", "receive"]), param(req, "action"));
  const { note } = parse(z.object({ note: z.string().trim().max(300).optional() }), req.body ?? {});
  await resolveReturn(param(req, "id"), actor.id, action, note);
  res.json(ok(await prisma.returnRequest.findUniqueOrThrow({ where: { id: param(req, "id") } })));
});

// ───────────── Coupons ─────────────

const couponData = (input: z.output<typeof couponInputSchema>) => ({
  ...input,
  maxDiscountPaise: input.type === "PERCENTAGE" ? (input.maxDiscountPaise ?? null) : null,
  startsAt: input.startsAt ?? null,
  endsAt: input.endsAt ?? null,
  usageLimit: input.usageLimit ?? null,
  perCustomerLimit: input.perCustomerLimit ?? null,
});

adminOpsRouter.get("/coupons", requirePermission("coupons:manage"), async (_req, res) => {
  const rows = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { redemptions: true } } } });
  res.json(ok(rows.map(({ _count, ...c }) => ({ ...c, timesUsed: _count.redemptions }))));
});

adminOpsRouter.post("/coupons", requirePermission("coupons:manage"), async (req, res) => {
  const actor = currentUser(req);
  const input = parse(couponInputSchema, req.body);
  if (await prisma.coupon.findUnique({ where: { code: input.code } })) throw conflict("A coupon with this code already exists.", "DUPLICATE_COUPON");
  const coupon = await prisma.coupon.create({ data: couponData(input) });
  await audit(prisma, { actorId: actor.id, action: "coupon.create", entityType: "Coupon", entityId: coupon.id, metadata: { code: coupon.code } });
  res.status(201).json(ok(coupon));
});

adminOpsRouter.patch("/coupons/:id", requirePermission("coupons:manage"), async (req, res) => {
  const actor = currentUser(req);
  const input = parse(couponInputSchema, req.body);
  const clash = await prisma.coupon.findFirst({ where: { code: input.code, id: { not: param(req, "id") } } });
  if (clash) throw conflict("A coupon with this code already exists.", "DUPLICATE_COUPON");
  const coupon = await prisma.coupon.update({ where: { id: param(req, "id") }, data: couponData(input) });
  await audit(prisma, { actorId: actor.id, action: "coupon.update", entityType: "Coupon", entityId: coupon.id, metadata: { code: coupon.code, isActive: coupon.isActive } });
  res.json(ok(coupon));
});

// ───────────── Delivery options ─────────────

adminOpsRouter.get("/shipping-methods", requirePermission("settings:manage"), async (_req, res) => {
  res.json(ok(await prisma.shippingMethod.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })));
});

adminOpsRouter.post("/shipping-methods", requirePermission("settings:manage"), async (req, res) => {
  const actor = currentUser(req);
  const input = parse(shippingMethodSchema, req.body);
  const row = await prisma.shippingMethod.create({ data: { ...input, freeAbovePaise: input.freeAbovePaise ?? null } });
  await audit(prisma, { actorId: actor.id, action: "shipping.create", entityType: "ShippingMethod", entityId: row.id, metadata: { code: row.code } });
  res.status(201).json(ok(row));
});

adminOpsRouter.patch("/shipping-methods/:id", requirePermission("settings:manage"), async (req, res) => {
  const actor = currentUser(req);
  const input = parse(shippingMethodSchema, req.body);
  const row = await prisma.shippingMethod.update({ where: { id: param(req, "id") }, data: { ...input, freeAbovePaise: input.freeAbovePaise ?? null } });
  await audit(prisma, { actorId: actor.id, action: "shipping.update", entityType: "ShippingMethod", entityId: row.id, metadata: { code: row.code } });
  res.json(ok(row));
});

// ───────────── Reviews moderation ─────────────

adminOpsRouter.get("/reviews", requirePermission("reviews:moderate"), async (req, res) => {
  const q = parse(listQuerySchema, req.query);
  const where: Prisma.ReviewWhereInput = q.status === "PUBLISHED" || q.status === "HIDDEN" ? { status: q.status } : {};
  const [rows, total] = await Promise.all([
    prisma.review.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { product: { select: { name: true, slug: true } }, user: { select: { name: true, email: true } } } }),
    prisma.review.count({ where }),
  ]);
  res.json({ data: rows, meta: pageMeta(q.page, q.pageSize, total) });
});

adminOpsRouter.patch("/reviews/:id", requirePermission("reviews:moderate"), async (req, res) => {
  const actor = currentUser(req);
  const { status } = parse(z.object({ status: z.enum(["PUBLISHED", "HIDDEN"]) }), req.body);
  const review = await prisma.$transaction(async (tx) => {
    const r = await tx.review.update({ where: { id: param(req, "id") }, data: { status: status as ReviewStatus } });
    await refreshRating(tx, r.productId);
    await audit(tx, { actorId: actor.id, action: `review.${status.toLowerCase()}`, entityType: "Review", entityId: r.id });
    return r;
  });
  res.json(ok(review));
});

// ───────────── Audit log & newsletter ─────────────

adminOpsRouter.get("/audit-logs", requirePermission("audit:read"), async (req, res) => {
  const q = parse(listQuerySchema.extend({ entityType: z.string().max(40).optional() }), req.query);
  const where: Prisma.AuditLogWhereInput = { ...(q.entityType ? { entityType: q.entityType } : {}), ...(q.q ? { action: { contains: q.q } } : {}) };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { actor: { select: { name: true, email: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ data: rows, meta: pageMeta(q.page, q.pageSize, total) });
});

adminOpsRouter.get("/newsletter", requirePermission("newsletter:read"), async (req, res) => {
  const q = parse(listQuerySchema, req.query);
  const where = { unsubscribedAt: null };
  const [rows, total] = await Promise.all([
    prisma.newsletterSubscriber.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, email: true, source: true, consentAt: true } }),
    prisma.newsletterSubscriber.count({ where }),
  ]);
  res.json({ data: rows, meta: pageMeta(q.page, q.pageSize, total) });
});
