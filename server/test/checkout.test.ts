import { beforeEach, describe, expect, it } from "vitest";
import { releaseExpiredOrders } from "../src/jobs/release-expired.ts";
import { CouponType, prisma } from "../src/lib/prisma.ts";
import { checkoutBody, createProduct, fakeRazorpay, resetDb, seedShipping, signedIn, stockOf } from "./helpers.ts";

beforeEach(async () => {
  await resetDb();
  await seedShipping();
});

describe("checkout", () => {
  it("places a cash-on-delivery order with server-calculated totals", async () => {
    const p = await createProduct({ price: 450, stock: [5] });
    const c = await signedIn();
    await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 2 });
    const res = await c.post("/checkout", { ...checkoutBody("COD"), totalPaise: 1, discountPaise: 99999 });
    expect(res.status).toBe(201);
    const order = res.body.data.order;
    expect(order).toMatchObject({ status: "CONFIRMED", paymentStatus: "UNPAID", paymentMethod: "COD", subtotalPaise: 90000, discountPaise: 0, shippingPaise: 7900, totalPaise: 97900 });
    expect(order.orderNumber).toMatch(/^AEZ-\d{6}-[A-Z2-9]{6}$/);
    expect(res.body.data.razorpay).toBeNull();
    // COD commits stock straight away; the cart is emptied.
    expect(await stockOf(p.variants[0]!.id)).toMatchObject({ onHand: 3, reserved: 0 });
    expect((await c.get("/cart")).body.data.itemCount).toBe(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).soldCount).toBe(2);
  });

  it("charges shipping on the discounted subtotal, not the original one", async () => {
    const p = await createProduct({ price: 1100 });
    await prisma.coupon.create({ data: { code: "SAVE200", type: CouponType.FIXED, value: 20000 } });
    const c = await signedIn();
    await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 1 });
    // 1100 − 200 = 900 is below the ₹999 threshold, so shipping applies.
    const quote = (await c.post("/checkout/quote", { shippingMethodCode: "standard", couponCode: "save200" })).body.data;
    expect(quote).toMatchObject({ subtotalPaise: 110000, discountPaise: 20000, shippingPaise: 7900, totalPaise: 97900, coupon: { code: "SAVE200" } });
    const order = (await c.post("/checkout", checkoutBody("COD", { couponCode: "SAVE200" }))).body.data.order;
    expect(order.totalPaise).toBe(97900);
    expect(await prisma.couponRedemption.count()).toBe(1);
  });

  it("validates Indian address fields and requires sign-in", async () => {
    const p = await createProduct();
    const c = await signedIn();
    await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 1 });
    const bad = await c.post("/checkout", checkoutBody("COD", { address: { ...checkoutBody("COD").address, pincode: "12345", phone: "12345" } }));
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details)).toEqual(expect.arrayContaining(["address.pincode", "address.phone"]));
    const guest = await (await import("./helpers.ts")).client();
    expect((await guest.post("/checkout", checkoutBody("COD"))).status).toBe(401);
  });

  it("rejects checkout when a line can no longer be bought", async () => {
    const p = await createProduct({ stock: [2] });
    const c = await signedIn();
    await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 2 });
    await prisma.inventory.update({ where: { variantId: p.variants[0]!.id }, data: { onHand: 1 } });
    const res = await c.post("/checkout", checkoutBody("COD"));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CART_NEEDS_ATTENTION");
    expect(await prisma.order.count()).toBe(0);
  });

  it("creates only one order when the same cart is submitted twice at once", async () => {
    const p = await createProduct({ stock: [10] });
    const c = await signedIn();
    await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 1 });
    const results = await Promise.all([c.post("/checkout", checkoutBody("COD")), c.post("/checkout", checkoutBody("COD"))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await prisma.order.count()).toBe(1);
  });

  it("never oversells when many customers race for the last units", async () => {
    const p = await createProduct({ stock: [3] });
    const variantId = p.variants[0]!.id;
    const customers = await Promise.all(Array.from({ length: 8 }, () => signedIn()));
    for (const c of customers) expect((await c.post("/cart/items", { variantId, quantity: 1 })).status).toBe(201);

    const results = await Promise.all(customers.map((c) => c.post("/checkout", checkoutBody("COD"))));
    const placed = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(placed).toHaveLength(3);
    expect(rejected).toHaveLength(5);
    for (const r of rejected) expect(["OUT_OF_STOCK", "CART_NEEDS_ATTENTION"]).toContain(r.body.error.code);
    expect(await stockOf(variantId)).toMatchObject({ onHand: 0, reserved: 0 });
    expect(await prisma.order.count()).toBe(3);
    // Every unit sold is accounted for in the movement ledger.
    const sales = await prisma.inventoryMovement.aggregate({ where: { variantId, type: "SALE" }, _sum: { onHandDelta: true } });
    expect(sales._sum.onHandDelta).toBe(-3);
  });

  it("refuses unavailable payment methods honestly", async () => {
    const p = await createProduct();
    await prisma.shippingMethod.create({ data: { code: "express", name: "Express", feePaise: 14900, minDays: 2, maxDays: 3, codAllowed: false } });
    const c = await signedIn();
    await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 1 });
    const res = await c.post("/checkout", checkoutBody("COD", { shippingMethodCode: "express" }));
    expect(res.body.error.code).toBe("COD_UNAVAILABLE");
    expect(await prisma.order.count()).toBe(0);
  });
});

describe("online payment orders", () => {
  it("reserves stock while awaiting payment and releases it on expiry", async () => {
    const gateway = fakeRazorpay();
    const p = await createProduct({ price: 1200, stock: [4] });
    await prisma.coupon.create({ data: { code: "ONCE", type: CouponType.FIXED, value: 10000, usageLimit: 1 } });
    const c = await signedIn();
    await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 2 });
    const res = await c.post("/checkout", checkoutBody("RAZORPAY", { couponCode: "ONCE" }));
    expect(res.status).toBe(201);
    expect(res.body.data.order).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "UNPAID", totalPaise: 230000 });
    expect(res.body.data.razorpay).toMatchObject({ keyId: "rzp_test_key", amountPaise: 230000, currency: "INR" });
    expect(gateway.orders).toHaveLength(1);
    expect(await stockOf(p.variants[0]!.id)).toMatchObject({ onHand: 4, reserved: 2 });

    // Not yet expired: nothing happens.
    expect(await releaseExpiredOrders()).toBe(0);
    const orderId = res.body.data.order.id;
    await prisma.order.update({ where: { id: orderId }, data: { reservationExpiresAt: new Date(Date.now() - 1000) } });
    expect(await releaseExpiredOrders()).toBe(1);
    expect(await stockOf(p.variants[0]!.id)).toMatchObject({ onHand: 4, reserved: 0 });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("CANCELLED");
    // The coupon use is released with the order.
    expect(await prisma.couponRedemption.count()).toBe(0);
  });

  it("cancels the order and releases stock if the gateway is unreachable", async () => {
    const { setRazorpayFetch } = await import("../src/lib/razorpay.ts");
    setRazorpayFetch(async () => {
      throw new Error("network down");
    });
    const p = await createProduct({ stock: [2] });
    const c = await signedIn();
    await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 1 });
    const res = await c.post("/checkout", checkoutBody("RAZORPAY"));
    expect(res.status).toBe(502);
    expect(await stockOf(p.variants[0]!.id)).toMatchObject({ onHand: 2, reserved: 0 });
    expect((await prisma.order.findFirstOrThrow()).status).toBe("CANCELLED");
  });
});
