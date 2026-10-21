// Storefront catalogue reads. Everything shown comes from the real catalogue — sections such as
// "Bestsellers" or testimonials only appear once genuine sales or reviews exist.
import { AGE_BANDS, NEW_ARRIVAL_DAYS, type ProductListQuery } from "@shared/catalog";
import type { CategoryDTO, ImageDTO, ProductCardDTO, ProductDetailDTO, ProductListDTO, ReviewDTO } from "@shared/types";
import { env } from "../../config/env.ts";
import { notFound } from "../../lib/errors.ts";
import { pageMeta, pagination } from "../../lib/http.ts";
import { Department, Prisma, ProductStatus, ReviewStatus, prisma } from "../../lib/prisma.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

// ───────────── Shared selects & mappers ─────────────

const imageSelect = { url: true, alt: true, width: true, height: true, colorId: true } satisfies Prisma.ProductImageSelect;
const imageOrder = [{ sortOrder: "asc" }, { createdAt: "asc" }] satisfies Prisma.ProductImageOrderByWithRelationInput[];

export const cardSelect = {
  id: true,
  slug: true,
  name: true,
  department: true,
  pricePaise: true,
  compareAtPaise: true,
  discountPercent: true,
  ratingAvg: true,
  ratingCount: true,
  publishedAt: true,
  images: { orderBy: imageOrder, take: 2, select: imageSelect },
  variants: {
    where: { isActive: true },
    select: { color: { select: { id: true, name: true, hex: true } }, inventory: { select: { onHand: true, reserved: true } } },
  },
} satisfies Prisma.ProductSelect;
type CardRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

const toImage = (i: { url: string; alt: string; width: number | null; height: number | null; colorId: string | null }): ImageDTO => ({ ...i });
const available = (inv: { onHand: number; reserved: number } | null) => (inv ? Math.max(0, inv.onHand - inv.reserved) : 0);

export function toCard(p: CardRow, now = Date.now()): ProductCardDTO {
  const colors = new Map<string, { id: string; name: string; hex: string }>();
  for (const v of p.variants) colors.set(v.color.id, v.color);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    department: p.department,
    pricePaise: p.pricePaise,
    compareAtPaise: p.discountPercent > 0 ? p.compareAtPaise : null,
    discountPercent: p.discountPercent,
    image: p.images[0] ? toImage(p.images[0]) : null,
    hoverImage: p.images[1] ? toImage(p.images[1]) : null,
    colors: [...colors.values()],
    inStock: p.variants.some((v) => available(v.inventory) > 0),
    isNew: p.publishedAt !== null && now - p.publishedAt.getTime() <= NEW_ARRIVAL_DAYS * DAY_MS,
    ratingAvg: p.ratingCount > 0 ? p.ratingAvg : null,
    ratingCount: p.ratingCount,
  };
}

const activeProduct = { status: ProductStatus.ACTIVE } satisfies Prisma.ProductWhereInput;

// ───────────── Categories ─────────────

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  department: Department;
  parentId: string | null;
  description: string | null;
  isFeatured: boolean;
  sortOrder: number;
}

let categoryCache: { at: number; rows: CategoryRow[]; productsByCategory: Map<string, Set<string>> } | null = null;
/** Call after admin catalogue writes so storefront counts update immediately. */
export const invalidateCatalogCache = () => {
  categoryCache = null;
};

async function loadCategories() {
  if (categoryCache && Date.now() - categoryCache.at < 30_000) return categoryCache;
  const [rows, links] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, department: true, parentId: true, description: true, isFeatured: true, sortOrder: true },
    }),
    prisma.productCategory.findMany({ where: { product: activeProduct }, select: { productId: true, categoryId: true } }),
  ]);
  const productsByCategory = new Map<string, Set<string>>();
  for (const l of links) {
    let set = productsByCategory.get(l.categoryId);
    if (!set) productsByCategory.set(l.categoryId, (set = new Set()));
    set.add(l.productId);
  }
  categoryCache = { at: Date.now(), rows, productsByCategory };
  return categoryCache;
}

function descendants(rows: CategoryRow[], rootId: string): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length; i++) for (const r of rows) if (r.parentId === out[i]) out.push(r.id);
  return out;
}

export async function categoryTree(opts: { department?: Department | undefined; nonEmpty?: boolean }): Promise<CategoryDTO[]> {
  const { rows, productsByCategory } = await loadCategories();
  const scoped = rows.filter((r) => !opts.department || r.department === opts.department);
  const count = (id: string) => {
    const ids = new Set<string>();
    for (const c of descendants(scoped, id)) for (const p of productsByCategory.get(c) ?? []) ids.add(p);
    return ids.size;
  };
  const build = (parentId: string | null): CategoryDTO[] =>
    scoped
      .filter((r) => r.parentId === parentId)
      .map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        department: r.department,
        parentId: r.parentId,
        description: r.description,
        isFeatured: r.isFeatured,
        productCount: count(r.id),
        children: build(r.id),
      }))
      .filter((c) => !opts.nonEmpty || c.productCount > 0);
  return build(null);
}

export async function getCategory(slug: string) {
  const { rows } = await loadCategories();
  const cat = rows.find((r) => r.slug === slug);
  if (!cat) throw notFound("Category");
  const parent = cat.parentId ? rows.find((r) => r.id === cat.parentId) ?? null : null;
  const [tree] = (await categoryTree({ department: cat.department })).flatMap(function find(c): CategoryDTO[] {
    return c.id === cat.id ? [c] : c.children.flatMap(find);
  });
  return { category: tree ?? null, parent: parent ? { name: parent.name, slug: parent.slug } : null };
}

// ───────────── Product listing ─────────────

async function productWhere(q: ProductListQuery): Promise<{ base: Prisma.ProductWhereInput; full: Prisma.ProductWhereInput }> {
  const and: Prisma.ProductWhereInput[] = [activeProduct];
  if (q.department) and.push({ department: q.department });
  if (q.category) {
    const { rows } = await loadCategories();
    const cat = rows.find((r) => r.slug === q.category);
    // Unknown category → no results (rather than silently ignoring the filter).
    and.push(cat ? { categories: { some: { categoryId: { in: descendants(rows, cat.id) } } } } : { id: "__none__" });
  }
  if (q.q) {
    const terms = q.q.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const term of terms) {
      and.push({
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
          { categories: { some: { category: { name: { contains: term, mode: "insensitive" } } } } },
        ],
      });
    }
  }
  const base: Prisma.ProductWhereInput = { AND: [...and] };

  if (q.minPrice != null) and.push({ pricePaise: { gte: q.minPrice * 100 } });
  if (q.maxPrice != null) and.push({ pricePaise: { lte: q.maxPrice * 100 } });
  if (q.minDiscount != null) and.push({ discountPercent: { gte: q.minDiscount } });
  if (q.age) {
    const band = AGE_BANDS[q.age];
    and.push({ ageMinMonths: { not: null, lt: band.maxMonths }, ageMaxMonths: { not: null, gt: band.minMonths } });
  }
  // Size, colour and stock must all hold for the same variant (e.g. "size M, in stock").
  if (q.sizes.length || q.colors.length || q.inStock) {
    and.push({
      variants: {
        some: {
          isActive: true,
          ...(q.sizes.length ? { size: { label: { in: q.sizes } } } : {}),
          ...(q.colors.length ? { color: { name: { in: q.colors } } } : {}),
          ...(q.inStock ? { inventory: { onHand: { gt: prisma.inventory.fields.reserved } } } : {}),
        },
      },
    });
  }
  return { base, full: { AND: and } };
}

function orderBy(sort: ProductListQuery["sort"]): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc":
      return [{ pricePaise: "asc" }, { id: "asc" }];
    case "price-desc":
      return [{ pricePaise: "desc" }, { id: "asc" }];
    case "popular":
      return [{ soldCount: "desc" }, { publishedAt: "desc" }, { id: "asc" }];
    default:
      return [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }];
  }
}

export async function listProducts(q: ProductListQuery): Promise<ProductListDTO> {
  const { page, pageSize, skip, take } = pagination(q, 24);
  const { base, full } = await productWhere(q);
  const [rows, total, baseIds, sales] = await Promise.all([
    prisma.product.findMany({ where: full, orderBy: orderBy(q.sort), skip, take, select: cardSelect }),
    prisma.product.count({ where: full }),
    prisma.product.findMany({ where: base, select: { id: true, pricePaise: true } }),
    prisma.product.findFirst({ where: { ...activeProduct, soldCount: { gt: 0 } }, select: { id: true } }),
  ]);

  // Facets are counted over the base result (search + department + category), so choosing a
  // size never hides the other sizes.
  const ids = baseIds.map((p) => p.id);
  const variants = ids.length
    ? await prisma.productVariant.findMany({
        where: { productId: { in: ids }, isActive: true },
        select: { productId: true, size: { select: { id: true, label: true, group: true, ageGuidance: true, sortOrder: true } }, color: { select: { id: true, name: true, hex: true } } },
      })
    : [];
  const sizes = new Map<string, { id: string; label: string; group: (typeof variants)[number]["size"]["group"]; ageGuidance: string | null; sortOrder: number; products: Set<string> }>();
  const colors = new Map<string, { id: string; name: string; hex: string; products: Set<string> }>();
  for (const v of variants) {
    // Sizes are filtered by label, so group identical labels together.
    const s = sizes.get(v.size.label) ?? { ...v.size, products: new Set<string>() };
    s.products.add(v.productId);
    sizes.set(v.size.label, s);
    const c = colors.get(v.color.name) ?? { ...v.color, products: new Set<string>() };
    c.products.add(v.productId);
    colors.set(v.color.name, c);
  }
  const prices = baseIds.map((p) => p.pricePaise);

  const now = Date.now();
  return {
    items: rows.map((r) => toCard(r, now)),
    meta: pageMeta(page, pageSize, total),
    facets: {
      sizes: [...sizes.values()]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
        .map(({ products, sortOrder: _s, ...s }) => ({ ...s, count: products.size })),
      colors: [...colors.values()].sort((a, b) => a.name.localeCompare(b.name)).map(({ products, ...c }) => ({ ...c, count: products.size })),
      priceRange: prices.length ? { minPaise: Math.min(...prices), maxPaise: Math.max(...prices) } : null,
      hasSalesData: sales !== null,
    },
  };
}

// ───────────── Product detail ─────────────

const detailSelect = {
  ...cardSelect,
  description: true,
  fabric: true,
  care: true,
  specs: true,
  ageMinMonths: true,
  ageMaxMonths: true,
  images: { orderBy: imageOrder, select: imageSelect },
  categories: { select: { category: { select: { name: true, slug: true, isActive: true } } } },
  variants: {
    where: { isActive: true },
    orderBy: [{ size: { sortOrder: "asc" } }, { color: { name: "asc" } }],
    select: {
      id: true,
      sku: true,
      pricePaise: true,
      size: { select: { id: true, label: true, group: true, ageGuidance: true } },
      color: { select: { id: true, name: true, hex: true } },
      inventory: { select: { onHand: true, reserved: true, lowStockThreshold: true } },
    },
  },
} satisfies Prisma.ProductSelect;

function parseSpecs(value: Prisma.JsonValue | null): { label: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s) =>
    s && typeof s === "object" && !Array.isArray(s) && typeof s["label"] === "string" && typeof s["value"] === "string" ? [{ label: s["label"], value: s["value"] }] : [],
  );
}

export async function getProduct(slug: string): Promise<ProductDetailDTO> {
  const p = await prisma.product.findFirst({ where: { slug, ...activeProduct }, select: detailSelect });
  if (!p) throw notFound("Product");
  const card = toCard({ ...p, images: p.images.slice(0, 2) });
  return {
    ...card,
    description: p.description,
    fabric: p.fabric,
    care: p.care,
    specs: parseSpecs(p.specs),
    images: p.images.map(toImage),
    variants: p.variants.map((v) => {
      const avail = available(v.inventory);
      return {
        id: v.id,
        sku: v.sku,
        size: v.size,
        color: v.color,
        pricePaise: v.pricePaise ?? p.pricePaise,
        available: Math.min(avail, env.MAX_CART_QUANTITY),
        lowStock: avail > 0 && avail <= (v.inventory?.lowStockThreshold ?? 0),
      };
    }),
    categories: p.categories.filter((c) => c.category.isActive).map((c) => ({ name: c.category.name, slug: c.category.slug })),
    ageMinMonths: p.ageMinMonths,
    ageMaxMonths: p.ageMaxMonths,
    publishedAt: p.publishedAt?.toISOString() ?? null,
  };
}

export async function relatedProducts(slug: string, limit = 8): Promise<ProductCardDTO[]> {
  const p = await prisma.product.findFirst({ where: { slug, ...activeProduct }, select: { id: true, department: true, categories: { select: { categoryId: true } } } });
  if (!p) throw notFound("Product");
  const categoryIds = p.categories.map((c) => c.categoryId);
  const rows = await prisma.product.findMany({
    where: { ...activeProduct, department: p.department, id: { not: p.id }, ...(categoryIds.length ? { categories: { some: { categoryId: { in: categoryIds } } } } : {}) },
    orderBy: [{ soldCount: "desc" }, { publishedAt: "desc" }],
    take: limit,
    select: cardSelect,
  });
  return rows.map((r) => toCard(r));
}

/** Cards for a list of slugs, in the given order (recently viewed, wishlist). */
export async function lookupProducts(slugs: string[]): Promise<ProductCardDTO[]> {
  if (!slugs.length) return [];
  const rows = await prisma.product.findMany({ where: { slug: { in: slugs }, ...activeProduct }, select: cardSelect });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return slugs.flatMap((s) => {
    const r = bySlug.get(s);
    return r ? [toCard(r)] : [];
  });
}

// ───────────── Home & search ─────────────

export async function homeSections() {
  const take = 8;
  const [newArrivals, bestsellers, onSale, kids, women, testimonials, categories] = await Promise.all([
    prisma.product.findMany({ where: activeProduct, orderBy: orderBy("newest"), take, select: cardSelect }),
    prisma.product.findMany({ where: { ...activeProduct, soldCount: { gt: 0 } }, orderBy: orderBy("popular"), take, select: cardSelect }),
    prisma.product.findMany({ where: { ...activeProduct, discountPercent: { gt: 0 } }, orderBy: [{ discountPercent: "desc" }, { publishedAt: "desc" }], take, select: cardSelect }),
    prisma.product.findMany({ where: { ...activeProduct, department: Department.KIDS }, orderBy: orderBy("newest"), take: 4, select: cardSelect }),
    prisma.product.findMany({ where: { ...activeProduct, department: Department.WOMEN }, orderBy: orderBy("newest"), take: 4, select: cardSelect }),
    prisma.review.findMany({
      where: { status: ReviewStatus.PUBLISHED, rating: { gte: 4 }, product: activeProduct },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, rating: true, title: true, body: true, createdAt: true, user: { select: { name: true } }, product: { select: { name: true, slug: true } } },
    }),
    categoryTree({ nonEmpty: true }),
  ]);
  const now = Date.now();
  const cards = (rows: CardRow[]) => rows.map((r) => toCard(r, now));
  const featured = categories.flatMap(function flat(c): CategoryDTO[] {
    return [c, ...c.children.flatMap(flat)];
  }).filter((c) => c.isFeatured);
  return {
    newArrivals: cards(newArrivals),
    bestsellers: cards(bestsellers),
    onSale: cards(onSale),
    kids: cards(kids),
    women: cards(women),
    featuredCategories: featured.slice(0, 8),
    testimonials: testimonials.map((t) => ({
      id: t.id,
      rating: t.rating,
      title: t.title,
      body: t.body,
      authorName: firstName(t.user.name),
      verifiedPurchase: true,
      createdAt: t.createdAt.toISOString(),
      product: t.product,
    })),
  };
}

export async function searchSuggestions(q: string) {
  const term = q.trim();
  if (term.length < 2) return { products: [], categories: [] };
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { ...activeProduct, OR: [{ name: { contains: term, mode: "insensitive" } }, { categories: { some: { category: { name: { contains: term, mode: "insensitive" } } } } }] },
      orderBy: [{ soldCount: "desc" }, { publishedAt: "desc" }],
      take: 6,
      select: cardSelect,
    }),
    prisma.category.findMany({ where: { isActive: true, name: { contains: term, mode: "insensitive" } }, take: 5, select: { name: true, slug: true, department: true } }),
  ]);
  return { products: products.map((p) => toCard(p)), categories };
}

// ───────────── Reviews (read) ─────────────

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "Customer";

export async function productReviews(slug: string, page = 1, pageSize = 10) {
  const product = await prisma.product.findFirst({ where: { slug, ...activeProduct }, select: { id: true, ratingAvg: true, ratingCount: true } });
  if (!product) throw notFound("Product");
  const where = { productId: product.id, status: ReviewStatus.PUBLISHED };
  const [rows, total, distribution] = await Promise.all([
    prisma.review.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, rating: true, title: true, body: true, createdAt: true, user: { select: { name: true } } } }),
    prisma.review.count({ where }),
    prisma.review.groupBy({ by: ["rating"], where, _count: { _all: true } }),
  ]);
  const reviews: ReviewDTO[] = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    authorName: firstName(r.user.name),
    verifiedPurchase: true,
    createdAt: r.createdAt.toISOString(),
  }));
  return {
    reviews,
    meta: pageMeta(page, pageSize, total),
    summary: {
      ratingAvg: product.ratingCount > 0 ? product.ratingAvg : null,
      ratingCount: product.ratingCount,
      distribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: distribution.find((d) => d.rating === star)?._count._all ?? 0 })),
    },
  };
}
