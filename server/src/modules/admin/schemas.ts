import { z } from "zod";
import { DEPARTMENTS, SIZE_GROUPS, describesMensFashion } from "@shared/catalog";

const MENS_MESSAGE = "AELITEZ sells kids' and women's fashion only — men's categories can't be created.";

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");

export const toSlug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const months = z.number().int().min(0).max(240).nullable().optional();
const paise = z.number().int().min(0).max(100_000_000);

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: slugSchema.optional(),
    description: z.string().trim().min(10).max(5000),
    fabric: optionalText(200),
    care: optionalText(500),
    specs: z.array(z.object({ label: z.string().trim().min(1).max(40), value: z.string().trim().min(1).max(200) })).max(20).default([]),
    department: z.enum(DEPARTMENTS),
    categoryIds: z.array(z.string().min(1).max(40)).max(12).default([]),
    pricePaise: paise.refine((v) => v >= 100, "Price must be at least ₹1"),
    compareAtPaise: paise.nullable().optional(),
    ageMinMonths: months,
    ageMaxMonths: months,
    isFeatured: z.boolean().optional(),
  })
  .refine((v) => v.compareAtPaise == null || v.compareAtPaise > v.pricePaise, { message: "Original price must be higher than the selling price", path: ["compareAtPaise"] })
  .refine((v) => v.ageMinMonths == null || v.ageMaxMonths == null || v.ageMinMonths <= v.ageMaxMonths, { message: "Minimum age must not exceed maximum age", path: ["ageMaxMonths"] });

export const productStatusSchema = z.object({ status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]) });

export const variantInputSchema = z.object({
  sizeId: z.string().min(1).max(40),
  colorId: z.string().min(1).max(40),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, "SKU: 2–40 letters, numbers or hyphens"),
  pricePaise: paise.nullable().optional(),
  initialStock: z.number().int().min(0).max(100_000).default(0),
  lowStockThreshold: z.number().int().min(0).max(1000).default(3),
});

export const variantUpdateSchema = z.object({
  sku: variantInputSchema.shape.sku.optional(),
  pricePaise: paise.nullable().optional(),
  isActive: z.boolean().optional(),
});

export const imageUpdateSchema = z.object({
  alt: z.string().trim().min(3).max(160).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  colorId: z.string().min(1).max(40).nullable().optional(),
});

const notMens = (v: string) => !describesMensFashion(v);

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(60).refine(notMens, MENS_MESSAGE),
  slug: slugSchema.refine(notMens, MENS_MESSAGE).optional(),
  department: z.enum(DEPARTMENTS),
  parentId: z.string().min(1).max(40).nullable().optional(),
  description: optionalText(300),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const sizeInputSchema = z.object({
  label: z.string().trim().min(1).max(20),
  group: z.enum(SIZE_GROUPS),
  ageGuidance: optionalText(40),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const colorInputSchema = z.object({
  name: z.string().trim().min(2).max(30),
  hex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1A2B3C")
    .transform((v) => v.toLowerCase()),
});

export const stockAdjustSchema = z.object({
  delta: z.number().int().min(-100_000).max(100_000).refine((v) => v !== 0, "Enter a non-zero amount"),
  reason: z.string().trim().min(3, "Say why the stock changed").max(200),
});

export const orderStatusSchema = z.object({
  status: z.enum(["PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED"]),
  note: z.string().trim().max(300).optional(),
});

export const shipmentSchema = z.object({
  carrier: z.string().trim().min(2).max(60),
  trackingNumber: z.string().trim().max(60).optional().transform((v) => v || null),
  trackingUrl: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((v) => v.startsWith("https://"), "Tracking links must use https")
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((v) => v || null),
});

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/, "3–30 letters, numbers, - or _"),
    description: optionalText(200),
    type: z.enum(["PERCENTAGE", "FIXED"]),
    value: z.number().int().min(1),
    maxDiscountPaise: paise.nullable().optional(),
    minSubtotalPaise: paise.default(0),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    usageLimit: z.number().int().min(1).nullable().optional(),
    perCustomerLimit: z.number().int().min(1).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.type !== "PERCENTAGE" || v.value <= 100, { message: "A percentage discount can be at most 100", path: ["value"] })
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt < v.endsAt, { message: "End date must be after the start date", path: ["endsAt"] });

export const shippingMethodSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{2,40}$/),
    name: z.string().trim().min(2).max(60),
    description: optionalText(200),
    feePaise: paise,
    freeAbovePaise: paise.nullable().optional(),
    minDays: z.number().int().min(0).max(60),
    maxDays: z.number().int().min(0).max(60),
    codAllowed: z.boolean().default(true),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .refine((v) => v.minDays <= v.maxDays, { message: "Minimum days must not exceed maximum days", path: ["maxDays"] });

export const listQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
