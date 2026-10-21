// Pure pricing rules. The API is the only place these run for real orders; the browser
// never supplies prices, discounts or totals.

export interface CouponRule {
  type: "PERCENTAGE" | "FIXED";
  /** Percent (1–100) or paise. */
  value: number;
  maxDiscountPaise: number | null;
  minSubtotalPaise: number;
}

export interface ShippingRule {
  feePaise: number;
  freeAbovePaise: number | null;
}

/** Discount in paise for a subtotal, never exceeding the subtotal or the coupon's cap. */
export function couponDiscount(coupon: CouponRule, subtotalPaise: number): number {
  if (subtotalPaise <= 0 || subtotalPaise < coupon.minSubtotalPaise) return 0;
  const raw = coupon.type === "PERCENTAGE" ? Math.floor((subtotalPaise * coupon.value) / 100) : coupon.value;
  const capped = coupon.maxDiscountPaise != null ? Math.min(raw, coupon.maxDiscountPaise) : raw;
  return Math.max(0, Math.min(capped, subtotalPaise));
}

/** Shipping fee after discounts; free when the discounted subtotal reaches the method's threshold. */
export function shippingFee(rule: ShippingRule, discountedSubtotalPaise: number): number {
  if (rule.freeAbovePaise != null && discountedSubtotalPaise >= rule.freeAbovePaise) return 0;
  return rule.feePaise;
}

export interface Totals {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
}

export function computeTotals(
  lines: ReadonlyArray<{ unitPricePaise: number; quantity: number }>,
  coupon: CouponRule | null,
  shipping: ShippingRule | null,
): Totals {
  const subtotalPaise = lines.reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0);
  const discountPaise = coupon ? couponDiscount(coupon, subtotalPaise) : 0;
  const shippingPaise = shipping && subtotalPaise > 0 ? shippingFee(shipping, subtotalPaise - discountPaise) : 0;
  return { subtotalPaise, discountPaise, shippingPaise, totalPaise: subtotalPaise - discountPaise + shippingPaise };
}
