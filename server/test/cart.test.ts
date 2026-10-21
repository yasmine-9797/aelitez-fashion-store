import { beforeEach, describe, expect, it } from "vitest";
import { ProductStatus, prisma } from "../src/lib/prisma.ts";
import { client, createProduct, createUser, resetDb, signedIn } from "./helpers.ts";

beforeEach(resetDb);

describe("cart", () => {
  it("prices lines from the database, ignoring prices sent by the browser", async () => {
    const p = await createProduct({ price: 899 });
    const c = await client();
    const res = await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 2, unitPricePaise: 1, lineTotalPaise: 2 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ itemCount: 2, subtotalPaise: 179800, purchasable: true });
    expect(res.body.data.items[0]).toMatchObject({ unitPricePaise: 89900, lineTotalPaise: 179800 });
  });

  it("uses a variant's own price when set", async () => {
    const p = await createProduct({ price: 1000 });
    await prisma.productVariant.update({ where: { id: p.variants[0]!.id }, data: { pricePaise: 120000 } });
    const c = await client();
    const res = await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 1 });
    expect(res.body.data.subtotalPaise).toBe(120000);
  });

  it("enforces stock and the per-item limit", async () => {
    const p = await createProduct({ stock: [3, 0, 50] });
    const c = await client();
    const [s, m, l] = p.variants;
    expect((await c.post("/cart/items", { variantId: m!.id, quantity: 1 })).body.error.code).toBe("OUT_OF_STOCK");
    expect((await c.post("/cart/items", { variantId: s!.id, quantity: 4 })).body.error.code).toBe("INSUFFICIENT_STOCK");
    expect((await c.post("/cart/items", { variantId: s!.id, quantity: 3 })).status).toBe(201);
    // Adding more of the same size counts what is already in the bag.
    expect((await c.post("/cart/items", { variantId: s!.id, quantity: 1 })).body.error.code).toBe("INSUFFICIENT_STOCK");
    expect((await c.post("/cart/items", { variantId: l!.id, quantity: 11 })).body.error.code).toBe("QUANTITY_LIMIT");
  });

  it("refuses unpublished products and unknown variants", async () => {
    const p = await createProduct({ status: ProductStatus.DRAFT });
    const c = await client();
    expect((await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 1 })).status).toBe(404);
    expect((await c.post("/cart/items", { variantId: "nope", quantity: 1 })).status).toBe(404);
    expect((await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 0 })).status).toBe(400);
  });

  it("updates, removes and flags lines that became unavailable", async () => {
    const p = await createProduct({ stock: [5] });
    const c = await client();
    const item = (await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 2 })).body.data.items[0];
    expect((await c.patch(`/cart/items/${item.id}`, { quantity: 4 })).body.data.itemCount).toBe(4);
    expect((await c.patch(`/cart/items/${item.id}`, { quantity: 6 })).status).toBe(409);

    await prisma.inventory.update({ where: { variantId: p.variants[0]!.id }, data: { onHand: 1 } });
    let cart = (await c.get("/cart")).body.data;
    expect(cart.items[0].issue).toBe("QUANTITY_REDUCED");
    expect(cart.purchasable).toBe(false);
    await prisma.product.update({ where: { id: p.id }, data: { status: ProductStatus.ARCHIVED } });
    cart = (await c.get("/cart")).body.data;
    expect(cart.items[0].issue).toBe("UNAVAILABLE");
    expect(cart.subtotalPaise).toBe(0);

    expect((await c.del(`/cart/items/${item.id}`)).body.data.items).toHaveLength(0);
  });

  it("never lets one visitor change another visitor's cart", async () => {
    const p = await createProduct();
    const owner = await client();
    const item = (await owner.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 1 })).body.data.items[0];
    const other = await signedIn();
    expect((await other.patch(`/cart/items/${item.id}`, { quantity: 3 })).status).toBe(404);
    expect((await other.del(`/cart/items/${item.id}`)).status).toBe(404);
    expect((await owner.get("/cart")).body.data.itemCount).toBe(1);
  });

  it("keeps the guest cart in an HttpOnly cookie and merges it on sign-in", async () => {
    const p = await createProduct({ stock: [20] });
    const { user, password } = await createUser();
    // The account already has 9 of this item from an earlier visit.
    const existing = await prisma.cart.create({ data: { userId: user.id } });
    await prisma.cartItem.create({ data: { cartId: existing.id, variantId: p.variants[0]!.id, quantity: 9 } });

    const c = await client();
    const add = await c.post("/cart/items", { variantId: p.variants[0]!.id, quantity: 3 });
    expect(String(add.headers["set-cookie"])).toMatch(/aez_cart=[^;]+;.*HttpOnly/i);
    await c.post("/auth/login", { email: user.email, password });
    const cart = (await c.get("/cart")).body.data;
    expect(cart.itemCount).toBe(10); // 9 + 3, capped at the per-item limit
    expect(await prisma.cart.count({ where: { userId: null } })).toBe(0);
  });
});

describe("wishlist", () => {
  it("saves products for signed-in customers only", async () => {
    const p = await createProduct();
    const guest = await client();
    expect((await guest.post("/wishlist/items", { productId: p.id })).status).toBe(401);
    const c = await signedIn();
    expect((await c.post("/wishlist/items", { productId: p.id })).body.data).toHaveLength(1);
    expect((await c.post("/wishlist/items", { productId: p.id })).body.data).toHaveLength(1); // idempotent
    expect((await c.del(`/wishlist/items/${p.id}`)).body.data).toHaveLength(0);
  });
});
