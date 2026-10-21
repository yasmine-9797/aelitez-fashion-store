// Money helpers. All amounts are integer paise (₹1 = 100 paise).

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inrPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats paise as rupees, e.g. 119900 → "₹1,199"; shows paise only when present. */
export function formatINR(paise: number): string {
  return paise % 100 === 0 ? inrWhole.format(paise / 100) : inrPaise.format(paise / 100);
}

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);
export const paiseToRupees = (paise: number): number => paise / 100;

/**
 * Whole-number discount derived from real prices. Rounds down so the advertised
 * discount is never larger than the actual one. Returns 0 when there is no discount.
 */
export function discountPercent(pricePaise: number, compareAtPaise: number | null | undefined): number {
  if (!compareAtPaise || compareAtPaise <= pricePaise || compareAtPaise <= 0) return 0;
  // Integer arithmetic (matches the database CHECK constraint exactly — no 29.999… rounding).
  return Math.floor(((compareAtPaise - pricePaise) * 100) / compareAtPaise);
}
