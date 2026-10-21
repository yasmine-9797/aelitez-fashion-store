import { beforeEach, describe, expect, it } from "vitest";
import { CouponType, OrderStatus, prisma, Role } from "../src/lib/prisma.ts";
import { checkoutBody, createProduct, resetDb, seedShipping, signedIn } from "./helpers.ts";

beforeEach(async () => {
  await resetDb();
  await seedShipping();
});

async function customerWithCart(price = 1000) {
  const c = await signedIn();
  const p = await createProduct({ price, stock: [50] });
  await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 1 });
  return { c, p };
}

const quote = (c: Awaited<ReturnType<typeof signedIn>>, couponCode: string) => c.post("/checkout/quote", { shippingMethodCode: "standard", couponCode }).then((r) => r.body.data);

describe("coupon validation", () => {
  it("checks activity, dates and minimum spend", async () => {
    const day = 24 * 60 * 60 * 1000;
    await prisma.coupon.createMany({
      data: [
        { code: "OFF", type: CouponType.FIXED, value: 5000, isActive: false },
        { code: "SOON", type: CouponType.FIXED, value: 5000, startsAt: new Date(Date.now() + day) },
        { code: "OLD", type: CouponType.FIXED, value: 5000, endsAt: new Date(Date.now() - day) },
        { code: "MIN", type: CouponType.FIXED, value: 5000, minSubtotalPaise: 200000 },
        { code: "PCT", type: CouponType.PERCENTAGE, value: 20, maxDiscountPaise: 15000 },
      ],
    });
    const { c } = await customerWithCart(1000);
    expect((await quote(c, "OFF")).couponError).toMatch(/isn't valid/);
    expect((await quote(c, "SOON")).couponError).toMatch(/isn't valid/);
    expect((await quote(c, "OLD")).couponError).toMatch(/expired/);
    expect((await quote(c, "MIN")).couponError).toMatch(/Add ₹1,000 more/);
    expect((await quote(c, "nope")).couponError).toMatch(/isn't valid/);
    const pct = await quote(c, "pct");
    expect(pct).toMatchObject({ discountPaise: 15000, couponError: null }); // 20% of ₹1,000 capped at ₹150
  });

  it("enforces per-customer limits", async () => {
    await prisma.coupon.create({ data: { code: "ONCEEACH", type: CouponType.FIXED, value: 5000, perCustomerLimit: 1 } });
    const { c, p } = await customerWithCart();
    expect((await c.post("/checkout", checkoutBody("COD", { couponCode: "ONCEEACH" }))).status).toBe(201);
    await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 1 });
    expect((await quote(c, "ONCEEACH")).couponError).toMatch(/already used/);
    expect((await c.post("/checkout", checkoutBody("COD", { couponCode: "ONCEEACH" }))).body.error.code).toBe("COUPON_INVALID");
  });

  it("never exceeds the total usage limit under concurrent checkouts", async () => {
    await prisma.coupon.create({ data: { code: "FIRST2", type: CouponType.FIXED, value: 5000, usageLimit: 2 } });
    const customers = [];
    for (let i = 0; i < 6; i++) customers.push(await customerWithCart()); // setup in sequence; only checkout races
    const results = await Promise.all(customers.map(({ c }) => c.post("/checkout", checkoutBody("COD", { couponCode: "FIRST2" }))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.body.error?.code === "COUPON_INVALID")).toHaveLength(4);
    expect(await prisma.couponRedemption.count()).toBe(2);
  });
});

describe("reviews", () => {
  it("accepts reviews only from customers who received the product", async () => {
    const { c, p } = await customerWithCart();
    const review = { rating: 5, title: "Lovely", body: "Great fit and the fabric feels premium." };
    expect((await c.post(`/products/${p.slug}/reviews`, review)).status).toBe(403);
    const order = (await c.post("/checkout", checkoutBody("COD"))).body.data.order;
    expect((await c.post(`/products/${p.slug}/reviews`, review)).status).toBe(403); // confirmed, not delivered
    await prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.DELIVERED, deliveredAt: new Date() } });
    expect((await c.get(`/products/${p.slug}/reviews/eligibility`)).body.data.canReview).toBe(true);
    expect((await c.post(`/products/${p.slug}/reviews`, { rating: 6, body: "x" })).status).toBe(400);
    expect((await c.post(`/products/${p.slug}/reviews`, review)).status).toBe(201);
    expect((await c.post(`/products/${p.slug}/reviews`, review)).status).toBe(409);

    const listed = (await c.get(`/products/${p.slug}/reviews`)).body.data;
    expect(listed.summary).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    expect(listed.reviews[0]).toMatchObject({ verifiedPurchase: true, authorName: "Test" });
  });

  it("recomputes ratings when staff hide a review", async () => {
    const { c, p } = await customerWithCart();
    const order = (await c.post("/checkout", checkoutBody("COD"))).body.data.order;
    await prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.DELIVERED, deliveredAt: new Date() } });
    await c.post(`/products/${p.slug}/reviews`, { rating: 2, body: "Colour was different from the photos." });
    const staff = await signedIn(Role.STAFF);
    const review = await prisma.review.findFirstOrThrow();
    await staff.patch(`/admin/reviews/${review.id}`, { status: "HIDDEN" });
    const product = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(product).toMatchObject({ ratingCount: 0, ratingAvg: null });
  });
});
