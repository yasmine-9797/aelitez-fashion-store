import { beforeEach, describe, expect, it } from "vitest";
import { Department, ProductStatus, prisma } from "../src/lib/prisma.ts";
import { invalidateCatalogCache } from "../src/modules/catalog/service.ts";
import { client, createProduct, resetDb } from "./helpers.ts";

beforeEach(async () => {
  await resetDb();
  invalidateCatalogCache();
});

const names = (res: { body: { data: { items: { name: string }[] } } }) => res.body.data.items.map((i) => i.name).sort();

describe("product listing", () => {
  it("only lists published products", async () => {
    await createProduct({ name: "Live Dress" });
    await createProduct({ name: "Draft Dress", status: ProductStatus.DRAFT });
    await createProduct({ name: "Old Dress", status: ProductStatus.ARCHIVED });
    const c = await client();
    expect(names(await c.get("/products"))).toEqual(["Live Dress"]);
  });

  it("searches across name, description and category, word by word", async () => {
    await createProduct({ name: "Floral Anarkali Kurta", categorySlug: "women-kurtas" });
    await createProduct({ name: "Denim Jacket" });
    const c = await client();
    expect(names(await c.get("/products?q=anarkali"))).toEqual(["Floral Anarkali Kurta"]);
    expect(names(await c.get("/products?q=KURTA floral"))).toEqual(["Floral Anarkali Kurta"]);
    expect(names(await c.get("/products?q=women-kurtas"))).toEqual(["Floral Anarkali Kurta"]); // category name match
    expect(names(await c.get("/products?q=zzz"))).toEqual([]);
  });

  it("filters by department and by category including subcategories", async () => {
    const parent = await prisma.category.create({ data: { name: "Ethnic Wear", slug: "women-ethnic-wear", department: Department.WOMEN } });
    await prisma.category.create({ data: { name: "Kurtis", slug: "women-kurtis", department: Department.WOMEN, parentId: parent.id } });
    await createProduct({ name: "Kurti A", categorySlug: "women-kurtis" });
    await createProduct({ name: "Kids Frock", department: Department.KIDS, categorySlug: "kids-dresses" });
    invalidateCatalogCache();
    const c = await client();
    expect(names(await c.get("/products?category=women-ethnic-wear"))).toEqual(["Kurti A"]);
    expect(names(await c.get("/products?department=KIDS"))).toEqual(["Kids Frock"]);
    expect(names(await c.get("/products?category=does-not-exist"))).toEqual([]);
  });

  it("requires size and stock to match the same variant", async () => {
    // S has stock, M is sold out.
    await createProduct({ name: "Tee", stock: [3, 0] });
    const c = await client();
    expect(names(await c.get("/products?sizes=S&inStock=1"))).toEqual(["Tee"]);
    expect(names(await c.get("/products?sizes=M&inStock=1"))).toEqual([]);
    expect(names(await c.get("/products?sizes=M"))).toEqual(["Tee"]);
  });

  it("treats reserved stock as unavailable", async () => {
    const p = await createProduct({ name: "Last One", stock: [1] });
    await prisma.inventory.update({ where: { variantId: p.variants[0]!.id }, data: { reserved: 1 } });
    const c = await client();
    expect(names(await c.get("/products?inStock=1"))).toEqual([]);
    expect((await c.get(`/products/${p.slug}`)).body.data.variants[0].available).toBe(0);
  });

  it("filters by price, discount and age, and sorts by price", async () => {
    await createProduct({ name: "Budget", price: 499 });
    await createProduct({ name: "Sale", price: 700, compareAt: 1000 });
    await createProduct({ name: "Premium", price: 2999 });
    await createProduct({ name: "Toddler Set", department: Department.KIDS, price: 599, ages: [12, 36] });
    const c = await client();
    expect(names(await c.get("/products?minPrice=600&maxPrice=1000"))).toEqual(["Sale"]);
    expect(names(await c.get("/products?minDiscount=30"))).toEqual(["Sale"]);
    expect(names(await c.get("/products?minDiscount=31"))).toEqual([]);
    expect(names(await c.get("/products?age=1-3y"))).toEqual(["Toddler Set"]);
    expect(names(await c.get("/products?age=6-9y"))).toEqual([]);
    const sorted = (await c.get("/products?sort=price-desc")).body.data.items.map((i: { pricePaise: number }) => i.pricePaise);
    expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
  });

  it("returns discounts computed from real prices and honest facets", async () => {
    await createProduct({ name: "Sale", price: 701, compareAt: 1000 });
    await createProduct({ name: "Plain", price: 500 });
    const c = await client();
    const res = await c.get("/products");
    const sale = res.body.data.items.find((i: { name: string }) => i.name === "Sale");
    expect(sale.discountPercent).toBe(29);
    const plain = res.body.data.items.find((i: { name: string }) => i.name === "Plain");
    expect(plain.compareAtPaise).toBeNull();
    expect(res.body.data.facets.hasSalesData).toBe(false);
    expect(res.body.data.facets.priceRange).toEqual({ minPaise: 50000, maxPaise: 70100 });
  });

  it("paginates with accurate counts", async () => {
    for (let i = 0; i < 5; i++) await createProduct();
    const c = await client();
    const res = await c.get("/products?pageSize=2&page=3");
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.meta).toEqual({ page: 3, pageSize: 2, total: 5, totalPages: 3 });
  });

  it("rejects malformed filters", async () => {
    const c = await client();
    expect((await c.get("/products?sort=random")).status).toBe(400);
    expect((await c.get("/products?pageSize=1000")).status).toBe(400);
  });
});

describe("product detail and home", () => {
  it("exposes variants with capped availability and hides drafts", async () => {
    const p = await createProduct({ stock: [50, 2, 0] });
    const draft = await createProduct({ status: ProductStatus.DRAFT });
    const c = await client();
    const res = await c.get(`/products/${p.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.variants.map((v: { available: number }) => v.available)).toEqual([10, 2, 0]);
    expect(res.body.data.variants[1].lowStock).toBe(true);
    expect((await c.get(`/products/${draft.slug}`)).status).toBe(404);
  });

  it("shows bestsellers and testimonials only when real data exists", async () => {
    await createProduct({ name: "New" });
    const c = await client();
    let home = (await c.get("/home")).body.data;
    expect(home.bestsellers).toEqual([]);
    expect(home.testimonials).toEqual([]);
    await createProduct({ name: "Popular", soldCount: 12 });
    home = (await c.get("/home")).body.data;
    expect(home.bestsellers.map((p: { name: string }) => p.name)).toEqual(["Popular"]);
  });

  it("lists only non-empty categories when asked", async () => {
    await prisma.category.create({ data: { name: "Empty", slug: "women-empty", department: Department.WOMEN } });
    await createProduct({ categorySlug: "women-dresses" });
    invalidateCatalogCache();
    const c = await client();
    const all = (await c.get("/categories?department=WOMEN")).body.data.map((x: { slug: string }) => x.slug).sort();
    const nonEmpty = (await c.get("/categories?department=WOMEN&nonEmpty=1")).body.data.map((x: { slug: string }) => x.slug);
    expect(all).toEqual(["women-dresses", "women-empty"]);
    expect(nonEmpty).toEqual(["women-dresses"]);
  });
});
