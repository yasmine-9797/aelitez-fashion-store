import { beforeEach, describe, expect, it } from "vitest";
import { prisma, Role } from "../src/lib/prisma.ts";
import { checkoutBody, createProduct, resetDb, seedShipping, signedIn, stockOf, type Client } from "./helpers.ts";

beforeEach(async () => {
  await resetDb();
  await seedShipping();
});

async function codOrder(customer?: Client & { user: { id: string } }, stock = 5) {
  const c = customer ?? (await signedIn());
  const p = await createProduct({ stock: [stock], price: 1200 });
  await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 2 });
  const res = await c.post("/checkout", checkoutBody("COD"));
  expect(res.status).toBe(201);
  return { c, order: res.body.data.order as { id: string; status: string }, product: p };
}

describe("customer order access", () => {
  it("lists and shows only the customer's own orders", async () => {
    const { c, order } = await codOrder();
    expect((await c.get("/orders")).body.data.map((o: { id: string }) => o.id)).toEqual([order.id]);
    const detail = (await c.get(`/orders/${order.id}`)).body.data;
    expect(detail.events.map((e: { status: string }) => e.status)).toEqual(["PENDING_PAYMENT", "CONFIRMED"]);
    const other = await signedIn();
    expect((await other.get(`/orders/${order.id}`)).status).toBe(404);
    expect((await other.post(`/orders/${order.id}/cancel`)).status).toBe(404);
    expect((await other.get("/orders")).body.data).toEqual([]);
  });

  it("lets customers cancel before processing and restocks", async () => {
    const { c, order, product } = await codOrder();
    expect(await stockOf(product.variants[0]!.id)).toMatchObject({ onHand: 3 });
    const res = await c.post(`/orders/${order.id}/cancel`, { reason: "Ordered the wrong size" });
    expect(res.body.data.status).toBe("CANCELLED");
    expect(await stockOf(product.variants[0]!.id)).toMatchObject({ onHand: 5, reserved: 0 });
    expect((await c.post(`/orders/${order.id}/cancel`)).status).toBe(409);
  });
});

describe("admin order workflow", () => {
  it("follows the state machine and rejects jumps", async () => {
    const { order } = await codOrder();
    const admin = await signedIn(Role.ADMIN);
    const set = (status: string) => admin.post(`/admin/orders/${order.id}/status`, { status });
    expect((await set("DELIVERED")).body.error.code).toBe("INVALID_TRANSITION");
    expect((await set("SHIPPED")).status).toBe(409);
    expect((await set("PROCESSING")).body.data.status).toBe("PROCESSING");
    expect((await set("PACKED")).body.data.status).toBe("PACKED");
    // Shipping needs courier details.
    expect((await set("SHIPPED")).body.error.code).toBe("SHIPMENT_REQUIRED");
    const shipped = await admin.post(`/admin/orders/${order.id}/shipment`, { carrier: "Delhivery", trackingNumber: "DL123", trackingUrl: "http://insecure.example/track" });
    expect(shipped.status).toBe(400); // tracking links must be https
    const ok = await admin.post(`/admin/orders/${order.id}/shipment`, { carrier: "Delhivery", trackingNumber: "DL123", trackingUrl: "https://track.example/DL123" });
    expect(ok.body.data).toMatchObject({ status: "SHIPPED", shipment: { carrier: "Delhivery", trackingNumber: "DL123" } });
    expect((await set("CANCELLED")).status).toBe(409); // cannot cancel once shipped
    expect((await set("DELIVERED")).body.data.status).toBe("DELIVERED");
    const audit = await prisma.auditLog.findMany({ where: { entityId: order.id } });
    expect(audit.length).toBeGreaterThanOrEqual(4);
  });

  it("never lets staff confirm an unpaid online order", async () => {
    const admin = await signedIn(Role.ADMIN);
    const { fakeRazorpay } = await import("./helpers.ts");
    fakeRazorpay();
    const c = await signedIn();
    const p = await createProduct();
    await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 1 });
    const order = (await c.post("/checkout", checkoutBody("RAZORPAY"))).body.data.order;
    for (const status of ["PROCESSING", "PACKED", "DELIVERED"]) {
      expect((await admin.post(`/admin/orders/${order.id}/status`, { status })).status).toBe(409);
    }
    expect((await admin.post(`/admin/orders/${order.id}/status`, { status: "CONFIRMED" })).status).toBe(400); // not a manual status
    expect((await admin.post(`/admin/orders/${order.id}/cod-collected`)).status).toBe(400);
  });

  it("records COD collection only after dispatch", async () => {
    const { order } = await codOrder();
    const admin = await signedIn(Role.ADMIN);
    expect((await admin.post(`/admin/orders/${order.id}/cod-collected`)).status).toBe(409);
    await admin.post(`/admin/orders/${order.id}/status`, { status: "PROCESSING" });
    await admin.post(`/admin/orders/${order.id}/status`, { status: "PACKED" });
    await admin.post(`/admin/orders/${order.id}/shipment`, { carrier: "India Post" });
    const res = await admin.post(`/admin/orders/${order.id}/cod-collected`);
    expect(res.body.data.paymentStatus).toBe("PAID");
    const dash = (await admin.get("/admin/dashboard")).body.data;
    expect(dash.revenue).toMatchObject({ paidPaise: 240000, paidOrders: 1 });
  });
});

describe("returns and refunds", () => {
  async function deliveredCod() {
    const { c, order, product } = await codOrder();
    const admin = await signedIn(Role.ADMIN);
    for (const status of ["PROCESSING", "PACKED"]) await admin.post(`/admin/orders/${order.id}/status`, { status });
    await admin.post(`/admin/orders/${order.id}/shipment`, { carrier: "Delhivery" });
    await admin.post(`/admin/orders/${order.id}/status`, { status: "DELIVERED" });
    await admin.post(`/admin/orders/${order.id}/cod-collected`);
    return { c, admin, order, product };
  }

  it("runs request → approve → receive (restock) → refund with evidence", async () => {
    const { c, admin, order, product } = await deliveredCod();
    expect(await stockOf(product.variants[0]!.id)).toMatchObject({ onHand: 3 });
    const requested = await c.post(`/orders/${order.id}/returns`, { reason: "SIZE_ISSUE", details: "Too small" });
    expect(requested.body.data).toMatchObject({ status: "RETURN_REQUESTED", canRequestReturn: false });
    expect((await c.post(`/orders/${order.id}/returns`, { reason: "OTHER" })).status).toBe(409);

    const rr = await prisma.returnRequest.findFirstOrThrow();
    expect((await admin.post(`/admin/returns/${rr.id}/receive`)).status).toBe(409); // approve first
    await admin.post(`/admin/returns/${rr.id}/approve`, { note: "Pickup scheduled" });
    await admin.post(`/admin/returns/${rr.id}/receive`);
    expect(await stockOf(product.variants[0]!.id)).toMatchObject({ onHand: 5 });

    // COD refunds need a payment reference — nothing is marked refunded without evidence.
    expect((await admin.post(`/admin/orders/${order.id}/refund`, {})).body.error.code).toBe("REFERENCE_REQUIRED");
    const refunded = await admin.post(`/admin/orders/${order.id}/refund`, { manualReference: "UPI-REF-778899" });
    expect(refunded.body.data).toMatchObject({ status: "REFUNDED", paymentStatus: "REFUNDED", requiresRefund: false });
    expect((await prisma.returnRequest.findUniqueOrThrow({ where: { id: rr.id } })).status).toBe("REFUNDED");
    expect((await admin.post(`/admin/orders/${order.id}/refund`, { manualReference: "again" })).status).toBe(409);
  });

  it("closes the return window after the configured days", async () => {
    const { c, order } = await deliveredCod();
    await prisma.order.update({ where: { id: order.id }, data: { deliveredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } });
    const res = await c.post(`/orders/${order.id}/returns`, { reason: "SIZE_ISSUE" });
    expect(res.body.error.code).toBe("RETURN_WINDOW_CLOSED");
  });

  it("returns a rejected request to delivered", async () => {
    const { c, admin, order } = await deliveredCod();
    await c.post(`/orders/${order.id}/returns`, { reason: "OTHER" });
    const rr = await prisma.returnRequest.findFirstOrThrow();
    await admin.post(`/admin/returns/${rr.id}/reject`, { note: "Item was worn" });
    expect((await c.get(`/orders/${order.id}`)).body.data.status).toBe("DELIVERED");
  });

  it("only lets ADMIN (not STAFF) issue refunds", async () => {
    const { c, order } = await deliveredCod();
    await c.post(`/orders/${order.id}/returns`, { reason: "DAMAGED" });
    const staff = await signedIn(Role.STAFF);
    const rr = await prisma.returnRequest.findFirstOrThrow();
    expect((await staff.post(`/admin/returns/${rr.id}/approve`)).status).toBe(200);
    expect((await staff.post(`/admin/returns/${rr.id}/receive`)).status).toBe(200);
    expect((await staff.post(`/admin/orders/${order.id}/refund`, { manualReference: "X" })).status).toBe(403);
  });
});
