// Catalogue vocabulary shared by the storefront and the API.
import { z } from "zod";

/** AELITEZ sells only children's and women's fashion — there is no men's department. */
export const DEPARTMENTS = ["KIDS", "WOMEN"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABEL: Readonly<Record<Department, string>> = {
  KIDS: "Kids",
  WOMEN: "Women",
};
export const DEPARTMENT_PATH: Readonly<Record<Department, string>> = {
  KIDS: "/kids",
  WOMEN: "/women",
};

export const SIZE_GROUPS = ["BABY", "KIDS", "WOMEN", "ONE_SIZE"] as const;
export type SizeGroup = (typeof SIZE_GROUPS)[number];

/**
 * Words that describe adult men's fashion. Category names/slugs containing them are rejected.
 * Word boundaries keep "women" and "boys" allowed.
 */
const MENS_TERMS = /\b(men|mens|men's|man|gents?|gentlemen|male|menswear|for him)\b/i;
export const describesMensFashion = (text: string): boolean => MENS_TERMS.test(text.replace(/[-_]/g, " "));

/** Age bands for "shop by age". Matched against the catalogue's age guidance, never inferred from size. */
export const AGE_BANDS = {
  "0-12m": { label: "0–12 months", minMonths: 0, maxMonths: 12 },
  "1-3y": { label: "1–3 years", minMonths: 12, maxMonths: 36 },
  "3-6y": { label: "3–6 years", minMonths: 36, maxMonths: 72 },
  "6-9y": { label: "6–9 years", minMonths: 72, maxMonths: 108 },
  "9-12y": { label: "9–12 years", minMonths: 108, maxMonths: 144 },
  "12-16y": { label: "12–16 years (teens)", minMonths: 144, maxMonths: 192 },
} as const;
export type AgeBand = keyof typeof AGE_BANDS;
export const AGE_BAND_KEYS = Object.keys(AGE_BANDS) as [AgeBand, ...AgeBand[]];

/** Human-readable age range from catalogue months, e.g. (24, 36) → "2–3 years". */
export function formatAgeRange(minMonths: number | null | undefined, maxMonths: number | null | undefined): string | null {
  const years = (m: number) => Math.round((m / 12) * 2) / 2; // nearest half year
  const unit = (m: number) => (m < 24 ? `${m} months` : `${years(m)} years`);
  if (minMonths != null && maxMonths != null) {
    if (maxMonths <= 24) return `${minMonths}–${maxMonths} months`;
    if (minMonths >= 24) return `${years(minMonths)}–${years(maxMonths)} years`;
    return `${unit(minMonths)} – ${unit(maxMonths)}`;
  }
  if (minMonths != null) return `${unit(minMonths)} and up`;
  if (maxMonths != null) return `Up to ${unit(maxMonths)}`;
  return null;
}

export const SORT_OPTIONS = {
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  popular: "Most popular",
} as const;
export type SortKey = keyof typeof SORT_OPTIONS;

export const DISCOUNT_FILTERS = [10, 20, 30, 50] as const;

/** Products published within this many days are labelled "New". */
export const NEW_ARRIVAL_DAYS = 30;

const csv = z
  .string()
  .max(400)
  .optional()
  .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30) : []));

const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(min).max(max).optional());

/** Product listing filters — used for API query strings and storefront URL search params. */
export const productListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  category: z.string().trim().max(80).optional(),
  sizes: csv,
  colors: csv,
  /** Rupees (whole numbers) — friendlier in URLs than paise. */
  minPrice: optionalInt(0, 1_000_000),
  maxPrice: optionalInt(0, 1_000_000),
  inStock: z.preprocess((v) => v === "1" || v === "true" || v === true, z.boolean()).optional(),
  minDiscount: optionalInt(1, 90),
  age: z.enum(AGE_BAND_KEYS).optional(),
  sort: z.enum(Object.keys(SORT_OPTIONS) as [SortKey, ...SortKey[]]).optional(),
  page: optionalInt(1, 1000),
  pageSize: optionalInt(1, 48),
});
export type ProductListQuery = z.output<typeof productListQuerySchema>;
