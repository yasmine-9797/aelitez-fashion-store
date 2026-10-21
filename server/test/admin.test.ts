import fs from "node:fs";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { Department, prisma, Role } from "../src/lib/prisma.ts";
import { uploadRoot } from "../src/lib/storage.ts";
import { client, createProduct, resetDb, signedIn } from "./helpers.ts";

beforeEach(resetDb);

describe("admin access control", () => {
  it("blocks guests and customers from every admin area", async () => {
    const guest = await client();
    const customer = await signedIn();
    for (const path of ["/admin/dashboard", "/admin/orders", "/admin/products", "/admin/inventory", "/admin/coupons"]) {
      expect((await guest.get(path)).status).toBe(401);
      expect((await customer.get(path)).status).toBe(403);
    }
  });

  it("keeps money and settings ADMIN-only", async () => {
    const staff = await signedIn(Role.STAFF);
    expect((await staff.get("/admin/dashboard")).status).toBe(200);
    expect((await staff.get("/admin/orders")).status).toBe(200);
    expect((await staff.get("/admin/coupons")).status).toBe(403);
    expect((await staff.get("/admin/audit-logs")).status).toBe(403);
    expect((await staff.get("/admin/shipping-methods")).status).toBe(403);
    const admin = await signedIn(Role.ADMIN);
    expect((await admin.get("/admin/coupons")).status).toBe(200);
  });

  it("reports only real figures on an empty store", async () => {
    const admin = await signedIn(Role.ADMIN);
    const dash = (await admin.get("/admin/dashboard")).body.data;
    expect(dash.revenue).toEqual({ paidPaise: 0, paidOrders: 0 });
    expect(dash.salesTrend).toEqual([]);
    expect(dash.recentOrders).toEqual([]);
  });
});

describe("categories", () => {
  it("refuses men's fashion categories but allows boys'", async () => {
    const admin = await signedIn(Role.ADMIN);
    for (const name of ["Men", "Men's Kurtas", "Gents Collection", "For Him"]) {
      const res = await admin.post("/admin/categories", { name, department: "WOMEN" });
      expect(res.status, name).toBe(400);
    }
    expect((await admin.post("/admin/categories", { name: "Formal", slug: "mens-formal", department: "KIDS" })).status).toBe(400);
    expect((await admin.post("/admin/categories", { name: "Shirts", department: "MEN" })).status).toBe(400);
    expect((await admin.post("/admin/categories", { name: "Boys' Shirts", department: "KIDS" })).status).toBe(201);
  });

  it("also blocks men's slugs at the database level", async () => {
    await expect(prisma.category.create({ data: { name: "X", slug: "men-shirts", department: Department.WOMEN } })).rejects.toThrow();
  });

  it("keeps subcategories in the parent's department and prevents cycles", async () => {
    const admin = await signedIn(Role.ADMIN);
    const parent = (await admin.post("/admin/categories", { name: "Ethnic Wear", department: "WOMEN" })).body.data;
    expect((await admin.post("/admin/categories", { name: "Kids Kurta", department: "KIDS", parentId: parent.id })).status).toBe(400);
    const child = (await admin.post("/admin/categories", { name: "Kurtis", department: "WOMEN", parentId: parent.id })).body.data;
    expect((await admin.patch(`/admin/categories/${parent.id}`, { name: "Ethnic Wear", department: "WOMEN", parentId: child.id })).status).toBe(400);
  });
});

describe("products", () => {
  async function setup() {
    const admin = await signedIn(Role.ADMIN);
    const cat = (await admin.post("/admin/categories", { name: "Dresses", slug: "women-dresses", department: "WOMEN" })).body.data;
    const size = (await admin.post("/admin/sizes", { label: "M", group: "WOMEN" })).body.data;
    const color = (await admin.post("/admin/colors", { name: "Teal", hex: "#008080" })).body.data;
    return { admin, cat, size, color };
  }
  const productBody = (categoryId: string, extra: Record<string, unknown> = {}) => ({
    name: "Tiered Maxi Dress",
    description: "A breezy tiered maxi dress for summer.",
    department: "WOMEN",
    categoryIds: [categoryId],
    pricePaise: 149900,
    compareAtPaise: 199900,
    ...extra,
  });

  it("creates drafts, validates prices and blocks mass assignment", async () => {
    const { admin, cat } = await setup();
    expect((await admin.post("/admin/products", productBody(cat.id, { compareAtPaise: 100000 }))).status).toBe(400);
    const res = await admin.post("/admin/products", productBody(cat.id, { status: "ACTIVE", soldCount: 9999, ratingAvg: 5, discountPercent: 90 }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "DRAFT", soldCount: 0, ratingAvg: null, discountPercent: 25, slug: "tiered-maxi-dress" });
    const again = await admin.post("/admin/products", productBody(cat.id));
    expect(again.body.data.slug).toBe("tiered-maxi-dress-2");
  });

  it("publishes only with an image, a variant and a category", async () => {
    const { admin, cat, size, color } = await setup();
    const product = (await admin.post("/admin/products", productBody(cat.id))).body.data;
    expect((await admin.post(`/admin/products/${product.id}/status`, { status: "ACTIVE" })).body.error.code).toBe("IMAGE_REQUIRED");

    // Upload: a renamed text file is rejected by content, a real image is accepted and re-encoded.
    const fake = await admin.agent
      .post(`/api/v1/admin/products/${product.id}/images`)
      .set("x-csrf-token", admin.csrf)
      .set("origin", "http://localhost:8080")
      .attach("images", Buffer.from("<script>alert(1)</script>"), { filename: "evil.png", contentType: "image/png" });
    expect(fake.status).toBe(400);
    const png = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#e11d24" } }).png().toBuffer();
    const up = await admin.agent
      .post(`/api/v1/admin/products/${product.id}/images`)
      .set("x-csrf-token", admin.csrf)
      .set("origin", "http://localhost:8080")
      .field("alt", "Teal tiered maxi dress")
      .attach("images", png, { filename: "dress.png", contentType: "image/png" });
    expect(up.status).toBe(201);
    const image = up.body.data.images[0];
    expect(image.url).toMatch(/\/uploads\/products\/.+-1600\.webp$/);
    expect(fs.existsSync(`${uploadRoot}/${image.storageKey}-800.webp`)).toBe(true);

    expect((await admin.post(`/admin/products/${product.id}/status`, { status: "ACTIVE" })).body.error.code).toBe("VARIANT_REQUIRED");
    const variant = await admin.post(`/admin/products/${product.id}/variants`, { sizeId: size.id, colorId: color.id, sku: "tmd-teal-m", initialStock: 6 });
    expect(variant.status).toBe(201);
    expect(variant.body.data.variants[0]).toMatchObject({ sku: "TMD-TEAL-M", inventory: { onHand: 6 } });
    expect((await admin.post(`/admin/products/${product.id}/variants`, { sizeId: size.id, colorId: color.id, sku: "OTHER" })).status).toBe(409);

    const live = await admin.post(`/admin/products/${product.id}/status`, { status: "ACTIVE" });
    expect(live.body.data.status).toBe("ACTIVE");
    expect(live.body.data.publishedAt).not.toBeNull();
    expect((await (await client()).get(`/products/${product.slug}`)).status).toBe(200);
  });
});

describe("inventory", () => {
  it("adjusts stock with a reason, records movements and never drops below reserved", async () => {
    const admin = await signedIn(Role.ADMIN);
    const p = await createProduct({ stock: [5] });
    const v = p.variants[0]!.id;
    await prisma.inventory.update({ where: { variantId: v }, data: { reserved: 2 } });
    expect((await admin.post(`/admin/inventory/${v}/adjust`, { delta: -4, reason: "Damaged in store" })).body.error.code).toBe("BELOW_RESERVED");
    expect((await admin.post(`/admin/inventory/${v}/adjust`, { delta: 3 })).status).toBe(400);
    const ok = await admin.post(`/admin/inventory/${v}/adjust`, { delta: -3, reason: "Damaged in store" });
    expect(ok.body.data).toMatchObject({ onHand: 2, reserved: 2 });
    const moves = (await admin.get(`/admin/inventory/${v}/movements`)).body.data;
    expect(moves[0]).toMatchObject({ type: "ADJUSTMENT", onHandDelta: -3, reason: "Damaged in store" });
    const out = (await admin.get("/admin/inventory?filter=out")).body.data;
    expect(out.map((r: { variantId: string }) => r.variantId)).toContain(v);
  });
});

describe("coupons", () => {
  it("validates coupon rules", async () => {
    const admin = await signedIn(Role.ADMIN);
    expect((await admin.post("/admin/coupons", { code: "BIG", type: "PERCENTAGE", value: 150 })).status).toBe(400);
    expect((await admin.post("/admin/coupons", { code: "DATES", type: "FIXED", value: 100, startsAt: "2026-12-01", endsAt: "2026-11-01" })).status).toBe(400);
    const ok = await admin.post("/admin/coupons", { code: "festive10", type: "PERCENTAGE", value: 10, maxDiscountPaise: 30000, minSubtotalPaise: 150000 });
    expect(ok.body.data.code).toBe("FESTIVE10");
    expect((await admin.post("/admin/coupons", { code: "FESTIVE10", type: "FIXED", value: 100 })).status).toBe(409);
  });
});
