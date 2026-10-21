// URL search params for listing pages. Everything is optional and malformed values are dropped
// (a bad link should show the listing, not an error page).
import { z } from "zod";
import { AGE_BAND_KEYS, SORT_OPTIONS, type ProductListQuery, type SortKey } from "@shared/catalog";

const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().catch(undefined);
// The router JSON-parses search values, so "32" or "2026" arrive as numbers — treat them as text.
const text = (max: number) => z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string().trim().max(max));
const csv = opt(text(400).pipe(z.string().regex(/^[^<>]*$/)));
const int = (min: number, max: number) => opt(z.coerce.number().int().min(min).max(max));

export const shopSearchSchema = z.object({
  q: opt(text(80)),
  category: opt(z.string().max(80).regex(/^[a-z0-9-]+$/)),
  sizes: csv,
  colors: csv,
  minPrice: int(0, 1_000_000),
  maxPrice: int(0, 1_000_000),
  inStock: opt(z.union([z.boolean(), z.literal(1).transform(() => true), z.enum(["1", "true"]).transform(() => true)])),
  minDiscount: int(1, 90),
  age: opt(z.enum(AGE_BAND_KEYS)),
  sort: opt(z.enum(Object.keys(SORT_OPTIONS) as [SortKey, ...SortKey[]])),
  page: int(1, 1000),
});
export type ShopSearch = z.output<typeof shopSearchSchema>;

export const validateShopSearch = (search: Record<string, unknown>): ShopSearch => shopSearchSchema.parse(search);

export const splitCsv = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

/** Converts URL search params into the API's listing query. */
export function toApiQuery(search: ShopSearch, department?: "KIDS" | "WOMEN"): Partial<ProductListQuery> {
  return {
    ...(department ? { department } : {}),
    ...(search.q ? { q: search.q } : {}),
    ...(search.category ? { category: search.category } : {}),
    sizes: splitCsv(search.sizes),
    colors: splitCsv(search.colors),
    ...(search.minPrice != null ? { minPrice: search.minPrice } : {}),
    ...(search.maxPrice != null ? { maxPrice: search.maxPrice } : {}),
    ...(search.inStock ? { inStock: true } : {}),
    ...(search.minDiscount ? { minDiscount: search.minDiscount } : {}),
    ...(search.age ? { age: search.age } : {}),
    ...(search.sort ? { sort: search.sort } : {}),
    ...(search.page ? { page: search.page } : {}),
    pageSize: 24,
  };
}

export const activeFilterCount = (s: ShopSearch) =>
  [s.category, s.sizes, s.colors, s.minPrice, s.maxPrice, s.inStock, s.minDiscount, s.age, s.q].filter((v) => v !== undefined && v !== "").length;
