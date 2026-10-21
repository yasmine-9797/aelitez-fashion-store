import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.ts";
import { API, app, checkoutBody, createProduct, fakeRazorpay, paymentSignature, resetDb, seedShipping, signedIn, stockOf, webhookSignature } from "./helpers.ts";

beforeEach(async () => {
  await resetDb();
  await seedShipping();
});

async function pendingOrder(price = 1000, stock = 3) {
  const gateway = fakeRazorpay();
  const p = await createProduct({ price, stock: [stock] });
  const c = await signedIn();
  await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 1 });
  const res = await c.post("/checkout", checkoutBody("RAZORPAY"));
  expect(res.status).toBe(201);
  return { c, gateway, product: p, order: res.body.data.order, rzpOrderId: res.body.data.razorpay.orderId as string, amount: res.body.data.order.totalPaise as number };
}

const webhook = (body: object, eventId: string, signature?: string) => {
  const raw = JSON.stringify(body);
  return request(app)
    .post(`${API}/payments/webhook`)
    .set("content-type", "application/json")
    .set("x-razorpay-event-id", eventId)
    .set("x-razorpay-signature", signature ?? webhookSignature(raw))
    .send(raw);
};

describe("checkout payment verification", () => {
  it("confirms the order only after the signature and the gateway both agree", async () => {
    const { c, gateway, order, rzpOrderId, amount, product } = await pendingOrder();
    gateway.payments["pay_ok"] = { status: "captured", amount, order_id: rzpOrderId };
    const res = await c.post("/payments/verify", { orderId: order.id, razorpayOrderId: rzpOrderId, razorpayPaymentId: "pay_ok", razorpaySignature: paymentSignature(rzpOrderId, "pay_ok") });
    expect(res.body.data).toEqual({ status: "paid" });
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID", stockCommitted: true });
    expect(await stockOf(product.variants[0]!.id)).toMatchObject({ onHand: 2, reserved: 0 });
  });

  it("rejects a forged signature without touching the order", async () => {
    const { c, gateway, order, rzpOrderId, amount } = await pendingOrder();
    gateway.payments["pay_x"] = { status: "captured", amount, order_id: rzpOrderId };
    const res = await c.post("/payments/verify", { orderId: order.id, razorpayOrderId: rzpOrderId, razorpayPaymentId: "pay_x", razorpaySignature: "0".repeat(64) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_SIGNATURE");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("UNPAID");
  });

  it("does not mark paid when the gateway has not captured the payment", async () => {
    const { c, gateway, order, rzpOrderId, amount } = await pendingOrder();
    gateway.payments["pay_pending"] = { status: "failed", amount, order_id: rzpOrderId };
    const res = await c.post("/payments/verify", { orderId: order.id, razorpayOrderId: rzpOrderId, razorpayPaymentId: "pay_pending", razorpaySignature: paymentSignature(rzpOrderId, "pay_pending") });
    expect(res.body.data).toEqual({ status: "pending" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
  });

  it("refuses to confirm when the captured amount differs from the order total", async () => {
    const { c, gateway, order, rzpOrderId, amount } = await pendingOrder();
    gateway.payments["pay_short"] = { status: "captured", amount: amount - 100, order_id: rzpOrderId };
    const res = await c.post("/payments/verify", { orderId: order.id, razorpayOrderId: rzpOrderId, razorpayPaymentId: "pay_short", razorpaySignature: paymentSignature(rzpOrderId, "pay_short") });
    expect(res.status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("UNPAID");
  });

  it("does not let another customer verify someone else's payment", async () => {
    const { gateway, order, rzpOrderId, amount } = await pendingOrder();
    gateway.payments["pay_ok"] = { status: "captured", amount, order_id: rzpOrderId };
    const intruder = await signedIn();
    const res = await intruder.post("/payments/verify", { orderId: order.id, razorpayOrderId: rzpOrderId, razorpayPaymentId: "pay_ok", razorpaySignature: paymentSignature(rzpOrderId, "pay_ok") });
    expect(res.status).toBe(404);
  });
});

describe("payment webhooks", () => {
  const captured = (rzpOrderId: string, amount: number, id = "pay_wh") => ({
    event: "payment.captured",
    payload: { payment: { entity: { id, order_id: rzpOrderId, amount, currency: "INR", status: "captured", method: "upi" } } },
  });

  it("rejects bad signatures", async () => {
    const { rzpOrderId, amount, order } = await pendingOrder();
    const res = await webhook(captured(rzpOrderId, amount), "evt_1", "f".repeat(64));
    expect(res.status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("UNPAID");
  });

  it("confirms on a verified webhook and ignores replays", async () => {
    const { rzpOrderId, amount, order, product } = await pendingOrder(1000, 5);
    const body = captured(rzpOrderId, amount);
    expect((await webhook(body, "evt_A")).body.data.result).toBe("processed");
    expect((await webhook(body, "evt_A")).body.data.result).toBe("duplicate");
    // Same payment delivered under a new event id is still processed only once.
    expect((await webhook(body, "evt_B")).status).toBe(200);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { events: true } });
    expect(saved.status).toBe("CONFIRMED");
    expect(saved.events.filter((e) => e.toStatus === "CONFIRMED")).toHaveLength(1);
    expect(await stockOf(product.variants[0]!.id)).toMatchObject({ onHand: 4, reserved: 0 });
    expect(await prisma.payment.count({ where: { status: "CAPTURED" } })).toBe(1);
  });

  it("handles concurrent duplicate deliveries safely", async () => {
    const { rzpOrderId, amount, order, product } = await pendingOrder(1000, 5);
    const body = captured(rzpOrderId, amount);
    const results = await Promise.all([webhook(body, "evt_C1"), webhook(body, "evt_C2"), webhook(body, "evt_C1")]);
    for (const r of results) expect(r.status).toBe(200);
    expect(await stockOf(product.variants[0]!.id)).toMatchObject({ onHand: 4, reserved: 0 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CONFIRMED");
  });

  it("flags payments that arrive after the order expired instead of confirming them", async () => {
    const { rzpOrderId, amount, order, product } = await pendingOrder();
    const { releaseExpiredOrders } = await import("../src/jobs/release-expired.ts");
    await prisma.order.update({ where: { id: order.id }, data: { reservationExpiresAt: new Date(Date.now() - 1000) } });
    await releaseExpiredOrders();
    await webhook(captured(rzpOrderId, amount), "evt_late");
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved).toMatchObject({ status: "CANCELLED", paymentStatus: "PAID", requiresRefund: true });
    expect(await stockOf(product.variants[0]!.id)).toMatchObject({ onHand: 3, reserved: 0 });
  });
});
