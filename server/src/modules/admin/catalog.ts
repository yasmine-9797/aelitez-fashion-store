import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { discountPercent } from "@shared/money";
import { env } from "../../config/env.ts";
import { audit } from "../../lib/audit.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { ok, pageMeta, parse, param } from "../../lib/http.ts";
import { InventoryMovementType, Prisma, ProductStatus, prisma, type Tx } from "../../lib/prisma.ts";
import { ALLOWED_UPLOAD_MIME, processProductImage, storage } from "../../lib/storage.ts";
import { currentUser, requirePermission } from "../../middleware/auth.ts";
import { invalidateCatalogCache } from "../catalog/service.ts";
import {
  categoryInputSchema,
  colorInputSchema,
  imageUpdateSchema,
  listQuerySchema,
  productInputSchema,
  productStatusSchema,
  sizeInputSchema,
  toSlug,
  variantInputSchema,
  variantUpdateSchema,
} from "./schemas.ts";

export const adminCatalogRouter = Router();
const canWrite = requirePermission("catalog:write");

const adminProductInclude = {
  categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
  images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
  variants: {
    orderBy: [{ size: { sortOrder: "asc" } }, { color: { name: "asc" } }],
    include: { size: true, color: true, inventory: true },
  },
} satisfies Prisma.ProductInclude;

const loadProduct = async (id: string) => {
  const p = await prisma.product.findUnique({ where: { id }, include: adminProductInclude });
  if (!p) throw notFound("Product");
  return p;
};

async function uniqueSlug(tx: Tx, base: string, excludeId?: string): Promise<string> {
  const root = base || "product";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const taken = await tx.product.findFirst({ where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${root}-${randomUUID().slice(0, 8)}`;
}

async function assertCategories(tx: Tx, ids: string[], department: string) {
  if (!ids.length) return;
  const rows = await tx.category.findMany({ where: { id: { in: ids } }, select: { id: true, department: true } });
  if (rows.length !== new Set(ids).size) throw badRequest("One of the selected categories no longer exists.", "INVALID_CATEGORY");
  if (rows.some((r) => r.department !== department)) throw badRequest("Categories must belong to the product's department.", "CATEGORY_DEPARTMENT_MISMATCH");
}

// ───────────── Products ─────────────

adminCatalogRouter.get("/products", async (req, res) => {
  const q = parse(listQuerySchema, req.query);
  const where: Prisma.ProductWhereInput = {
    ...(q.status && ["DRAFT", "ACTIVE", "ARCHIVED"].includes(q.status) ? { status: q.status as ProductStatus } : {}),
    ...(q.q
      ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { slug: { contains: q.q.toLowerCase() } }, { variants: { some: { sku: { contains: q.q.toUpperCase() } } } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { images: { orderBy: { sortOrder: "asc" }, take: 1 }, variants: { include: { inventory: true } } },
    }),
    prisma.product.count({ where }),
  ]);
  res.json({
    data: rows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      department: p.department,
      status: p.status,
      pricePaise: p.pricePaise,
      compareAtPaise: p.compareAtPaise,
      image: p.images[0]?.url ?? null,
      variantCount: p.variants.length,
      stockOnHand: p.variants.reduce((n, v) => n + (v.inventory?.onHand ?? 0), 0),
      soldCount: p.soldCount,
      updatedAt: p.updatedAt.toISOString(),
    })),
    meta: pageMeta(q.page, q.pageSize, total),
  });
});

adminCatalogRouter.get("/products/:id", async (req, res) => {
  res.json(ok(await loadProduct(param(req, "id"))));
});

adminCatalogRouter.post("/products", canWrite, async (req, res) => {
  const actor = currentUser(req);
  const input = parse(productInputSchema, req.body);
  const created = await prisma.$transaction(async (tx) => {
    await assertCategories(tx, input.categoryIds, input.department);
    const slug = await uniqueSlug(tx, input.slug ?? toSlug(input.name));
    const { categoryIds, specs, ...fields } = input;
    const product = await tx.product.create({
      data: {
        ...fields,
        slug,
        specs,
        compareAtPaise: fields.compareAtPaise ?? null,
        ageMinMonths: fields.ageMinMonths ?? null,
        ageMaxMonths: fields.ageMaxMonths ?? null,
        isFeatured: fields.isFeatured ?? false,
        discountPercent: discountPercent(fields.pricePaise, fields.compareAtPaise),
        status: ProductStatus.DRAFT,
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      },
    });
    await audit(tx, { actorId: actor.id, action: "product.create", entityType: "Product", entityId: product.id, metadata: { name: product.name } });
    return product;
  });
  invalidateCatalogCache();
  res.status(201).json(ok(await loadProduct(created.id)));
});

adminCatalogRouter.patch("/products/:id", canWrite, async (req, res) => {
  const actor = currentUser(req);
  const input = parse(productInputSchema, req.body);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({ where: { id: param(req, "id") } });
    if (!existing) throw notFound("Product");
    await assertCategories(tx, input.categoryIds, input.department);
    const slug = input.slug && input.slug !== existing.slug ? await uniqueSlug(tx, input.slug, existing.id) : existing.slug;
    const { categoryIds, specs, ...fields } = input;
    await tx.productCategory.deleteMany({ where: { productId: existing.id } });
    await tx.product.update({
      where: { id: existing.id },
      data: {
        ...fields,
        slug,
        specs,
        compareAtPaise: fields.compareAtPaise ?? null,
        ageMinMonths: fields.ageMinMonths ?? null,
        ageMaxMonths: fields.ageMaxMonths ?? null,
        isFeatured: fields.isFeatured ?? existing.isFeatured,
        discountPercent: discountPercent(fields.pricePaise, fields.compareAtPaise),
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      },
    });
    const changes = Object.fromEntries(
      (["name", "pricePaise", "compareAtPaise", "department"] as const).filter((k) => existing[k] !== (fields[k] ?? null)).map((k) => [k, { from: existing[k], to: fields[k] ?? null }]),
    );
    await audit(tx, { actorId: actor.id, action: "product.update", entityType: "Product", entityId: existing.id, metadata: changes });
  });
  invalidateCatalogCache();
  res.json(ok(await loadProduct(param(req, "id"))));
});

/** Publish / unpublish / archive. Publishing requires at least one image and one active variant. */
adminCatalogRouter.post("/products/:id/status", canWrite, async (req, res) => {
  const actor = currentUser(req);
  const { status } = parse(productStatusSchema, req.body);
  const product = await loadProduct(param(req, "id"));
  if (status === ProductStatus.ACTIVE) {
    if (!product.images.length) throw badRequest("Add at least one product image before publishing.", "IMAGE_REQUIRED");
    if (!product.variants.some((v) => v.isActive)) throw badRequest("Add at least one size/colour option before publishing.", "VARIANT_REQUIRED");
    if (!product.categories.length) throw badRequest("Choose at least one category before publishing.", "CATEGORY_REQUIRED");
  }
  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id: product.id }, data: { status, ...(status === ProductStatus.ACTIVE && !product.publishedAt ? { publishedAt: new Date() } : {}) } });
    await audit(tx, { actorId: actor.id, action: `product.status.${status.toLowerCase()}`, entityType: "Product", entityId: product.id, metadata: { from: product.status } });
  });
  invalidateCatalogCache();
  res.json(ok(await loadProduct(product.id)));
});

// ───────────── Variants ─────────────

adminCatalogRouter.post("/products/:id/variants", canWrite, async (req, res) => {
  const actor = currentUser(req);
  const input = parse(variantInputSchema, req.body);
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: param(req, "id") }, select: { id: true } });
    if (!product) throw notFound("Product");
    // Sequential: a transaction has a single connection, so its queries must not overlap.
    const size = await tx.size.findUnique({ where: { id: input.sizeId } });
    const color = await tx.color.findUnique({ where: { id: input.colorId } });
    if (!size || !color) throw badRequest("Choose a valid size and colour.", "INVALID_OPTION");
    const dup = await tx.productVariant.findFirst({ where: { OR: [{ sku: input.sku }, { productId: product.id, sizeId: size.id, colorId: color.id }] }, select: { sku: true } });
    if (dup) throw conflict(dup.sku === input.sku ? "That SKU is already in use." : "This size and colour combination already exists.", "DUPLICATE_VARIANT");
    const variant = await tx.productVariant.create({
      data: {
        productId: product.id,
        sizeId: size.id,
        colorId: color.id,
        sku: input.sku,
        pricePaise: input.pricePaise ?? null,
        inventory: { create: { onHand: input.initialStock, lowStockThreshold: input.lowStockThreshold } },
      },
    });
    if (input.initialStock > 0) {
      await tx.inventoryMovement.create({ data: { variantId: variant.id, type: InventoryMovementType.INITIAL, onHandDelta: input.initialStock, actorId: actor.id, reason: "Initial stock" } });
    }
    await audit(tx, { actorId: actor.id, action: "variant.create", entityType: "ProductVariant", entityId: variant.id, metadata: { sku: variant.sku, productId: product.id } });
  });
  invalidateCatalogCache();
  res.status(201).json(ok(await loadProduct(param(req, "id"))));
});

adminCatalogRouter.patch("/variants/:id", canWrite, async (req, res) => {
  const actor = currentUser(req);
  const input = parse(variantUpdateSchema, req.body);
  const variant = await prisma.productVariant.findUnique({ where: { id: param(req, "id") } });
  if (!variant) throw notFound("Variant");
  if (input.sku && input.sku !== variant.sku && (await prisma.productVariant.findUnique({ where: { sku: input.sku } }))) throw conflict("That SKU is already in use.", "DUPLICATE_VARIANT");
  await prisma.$transaction(async (tx) => {
    await tx.productVariant.update({
      where: { id: variant.id },
      data: { ...(input.sku ? { sku: input.sku } : {}), ...(input.pricePaise !== undefined ? { pricePaise: input.pricePaise } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) },
    });
    await audit(tx, { actorId: actor.id, action: "variant.update", entityType: "ProductVariant", entityId: variant.id, metadata: input });
  });
  invalidateCatalogCache();
  res.json(ok(await loadProduct(variant.productId)));
});

// ───────────── Images ─────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 8, fields: 10 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_UPLOAD_MIME.has(file.mimetype)),
});

adminCatalogRouter.post("/products/:id/images", canWrite, upload.array("images", 8), async (req, res) => {
  const actor = currentUser(req);
  const product = await prisma.product.findUnique({ where: { id: param(req, "id") }, select: { id: true, name: true, slug: true, images: { select: { sortOrder: true } } } });
  if (!product) throw notFound("Product");
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw badRequest("Choose JPEG, PNG, WebP or AVIF images to upload.", "NO_FILES");
  const altInput = typeof req.body?.alt === "string" ? req.body.alt.trim().slice(0, 160) : "";
  let sortOrder = Math.max(-1, ...product.images.map((i) => i.sortOrder));
  for (const file of files) {
    // Content is verified by decoding — the client-supplied MIME type and filename are not trusted.
    const processed = await processProductImage(file.buffer);
    const base = `products/${product.id}/${randomUUID()}`;
    const url = await storage.put(`${base}-1600.webp`, processed.large, "image/webp");
    await storage.put(`${base}-800.webp`, processed.small, "image/webp");
    sortOrder += 1;
    await prisma.productImage.create({
      data: { productId: product.id, url, storageKey: base, alt: altInput || product.name, width: processed.width, height: processed.height, sortOrder },
    });
  }
  await audit(prisma, { actorId: actor.id, action: "product.images.upload", entityType: "Product", entityId: product.id, metadata: { count: files.length } });
  invalidateCatalogCache();
  res.status(201).json(ok(await loadProduct(product.id)));
});

adminCatalogRouter.patch("/products/:id/images/:imageId", canWrite, async (req, res) => {
  const input = parse(imageUpdateSchema, req.body);
  const image = await prisma.productImage.findFirst({ where: { id: param(req, "imageId"), productId: param(req, "id") } });
  if (!image) throw notFound("Image");
  await prisma.productImage.update({ where: { id: image.id }, data: input });
  invalidateCatalogCache();
  res.json(ok(await loadProduct(param(req, "id"))));
});

adminCatalogRouter.delete("/products/:id/images/:imageId", canWrite, async (req, res) => {
  const actor = currentUser(req);
  const image = await prisma.productImage.findFirst({ where: { id: param(req, "imageId"), productId: param(req, "id") }, include: { product: { select: { status: true, _count: { select: { images: true } } } } } });
  if (!image) throw notFound("Image");
  if (image.product.status === ProductStatus.ACTIVE && image.product._count.images <= 1) throw badRequest("A published product needs at least one image. Unpublish it first.", "IMAGE_REQUIRED");
  await prisma.productImage.delete({ where: { id: image.id } });
  if (image.storageKey) await Promise.all([storage.remove(`${image.storageKey}-1600.webp`), storage.remove(`${image.storageKey}-800.webp`)]);
  await audit(prisma, { actorId: actor.id, action: "product.images.delete", entityType: "Product", entityId: param(req, "id") });
  invalidateCatalogCache();
  res.json(ok(await loadProduct(param(req, "id"))));
});

// ───────────── Categories, sizes, colours ─────────────

adminCatalogRouter.get("/categories", async (_req, res) => {
  const rows = await prisma.category.findMany({ orderBy: [{ department: "asc" }, { sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true, children: true } } } });
  res.json(ok(rows));
});

async function assertParent(tx: Tx, parentId: string | null | undefined, department: string, selfId?: string) {
  if (!parentId) return;
  const parent = await tx.category.findUnique({ where: { id: parentId } });
  if (!parent) throw badRequest("Parent category not found.", "INVALID_PARENT");
  if (parent.department !== department) throw badRequest("A subcategory must be in the same department as its parent.", "INVALID_PARENT");
  // Walk up the tree to prevent cycles.
  let cursor: string | null = parent.id;
  for (let depth = 0; cursor && depth < 20; depth++) {
    if (cursor === selfId) throw badRequest("A category cannot be placed inside itself.", "INVALID_PARENT");
    cursor = (await tx.category.findUnique({ where: { id: cursor }, select: { parentId: true } }))?.parentId ?? null;
  }
}

adminCatalogRouter.post("/categories", canWrite, async (req, res) => {
  const actor = currentUser(req);
  const input = parse(categoryInputSchema, req.body);
  const created = await prisma.$transaction(async (tx) => {
    await assertParent(tx, input.parentId, input.department);
    const category = await tx.category.create({ data: { ...input, slug: input.slug ?? toSlug(input.name), parentId: input.parentId ?? null } });
    await audit(tx, { actorId: actor.id, action: "category.create", entityType: "Category", entityId: category.id, metadata: { name: category.name } });
    return category;
  });
  invalidateCatalogCache();
  res.status(201).json(ok(created));
});

adminCatalogRouter.patch("/categories/:id", canWrite, async (req, res) => {
  const actor = currentUser(req);
  const input = parse(categoryInputSchema, req.body);
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.category.findUnique({ where: { id: param(req, "id") }, include: { _count: { select: { products: true } } } });
    if (!existing) throw notFound("Category");
    if (existing.department !== input.department && existing._count.products > 0) throw badRequest("Move this category's products before changing its department.", "CATEGORY_IN_USE");
    await assertParent(tx, input.parentId, input.department, existing.id);
    const category = await tx.category.update({ where: { id: existing.id }, data: { ...input, slug: input.slug ?? existing.slug, parentId: input.parentId ?? null } });
    await audit(tx, { actorId: actor.id, action: "category.update", entityType: "Category", entityId: category.id });
    return category;
  });
  invalidateCatalogCache();
  res.json(ok(updated));
});

adminCatalogRouter.delete("/categories/:id", canWrite, async (req, res) => {
  const actor = currentUser(req);
  const existing = await prisma.category.findUnique({ where: { id: param(req, "id") }, include: { _count: { select: { products: true, children: true } } } });
  if (!existing) throw notFound("Category");
  if (existing._count.children || existing._count.products) throw conflict("Only empty categories without subcategories can be deleted — deactivate it instead.", "CATEGORY_IN_USE");
  await prisma.category.delete({ where: { id: existing.id } });
  await audit(prisma, { actorId: actor.id, action: "category.delete", entityType: "Category", entityId: existing.id, metadata: { name: existing.name } });
  invalidateCatalogCache();
  res.json(ok({ deleted: true }));
});

adminCatalogRouter.get("/sizes", async (_req, res) => {
  res.json(ok(await prisma.size.findMany({ orderBy: [{ group: "asc" }, { sortOrder: "asc" }] })));
});
adminCatalogRouter.post("/sizes", canWrite, async (req, res) => {
  const input = parse(sizeInputSchema, req.body);
  res.status(201).json(ok(await prisma.size.create({ data: input })));
});
adminCatalogRouter.patch("/sizes/:id", canWrite, async (req, res) => {
  const input = parse(sizeInputSchema, req.body);
  res.json(ok(await prisma.size.update({ where: { id: param(req, "id") }, data: input })));
});

adminCatalogRouter.get("/colors", async (_req, res) => {
  res.json(ok(await prisma.color.findMany({ orderBy: { name: "asc" } })));
});
adminCatalogRouter.post("/colors", canWrite, async (req, res) => {
  const input = parse(colorInputSchema, req.body);
  res.status(201).json(ok(await prisma.color.create({ data: input })));
});
adminCatalogRouter.patch("/colors/:id", canWrite, async (req, res) => {
  const input = parse(colorInputSchema, req.body);
  res.json(ok(await prisma.color.update({ where: { id: param(req, "id") }, data: input })));
});
