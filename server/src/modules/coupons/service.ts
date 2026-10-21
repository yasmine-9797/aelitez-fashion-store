// Coupon eligibility is decided only here, on the server.
import { formatINR } from "@shared/money";
import { couponDiscount } from "@shared/pricing";
import type { Coupon } from "../../generated/prisma/client.ts";
import type { Db, Tx } from "../../lib/prisma.ts";

export type CouponResult = { ok: true; coupon: Coupon; discountPaise: number } | { ok: false; message: string };

/**
 * Checks a code for a customer and subtotal. With `tx`, the coupon row is locked first so
 * usage limits hold even when several orders use the same code at the same moment.
 */
export async function evaluateCoupon(db: Db, rawCode: string, userId: string, subtotalPaise: number, tx?: Tx): Promise<CouponResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, message: "Enter a coupon code." };
  if (tx) await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "code" = ${code} FOR UPDATE`;
  const coupon = await db.coupon.findUnique({ where: { code } });
  const invalid = { ok: false, message: "This coupon code isn't valid." } as const;
  if (!coupon || !coupon.isActive) return invalid;

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) return invalid;
  if (coupon.endsAt && coupon.endsAt <= now) return { ok: false, message: "This coupon has expired." };
  if (subtotalPaise < coupon.minSubtotalPaise) {
    return { ok: false, message: `Add ${formatINR(coupon.minSubtotalPaise - subtotalPaise)} more to use this coupon (minimum order ${formatINR(coupon.minSubtotalPaise)}).` };
  }
  if (coupon.usageLimit != null) {
    const used = await db.couponRedemption.count({ where: { couponId: coupon.id } });
    if (used >= coupon.usageLimit) return { ok: false, message: "This coupon has reached its usage limit." };
  }
  if (coupon.perCustomerLimit != null) {
    const usedByCustomer = await db.couponRedemption.count({ where: { couponId: coupon.id, userId } });
    if (usedByCustomer >= coupon.perCustomerLimit) return { ok: false, message: "You've already used this coupon." };
  }
  const discountPaise = couponDiscount(coupon, subtotalPaise);
  if (discountPaise <= 0) return invalid;
  return { ok: true, coupon, discountPaise };
}
