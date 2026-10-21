import { describe, expect, it } from "vitest";
import { describesMensFashion, formatAgeRange, productListQuerySchema } from "@shared/catalog";
import { discountPercent, formatINR } from "@shared/money";
import { adminCanSet, canTransition, ORDER_STATUSES, ORDER_TRANSITIONS } from "@shared/order-status";
import { computeTotals, couponDiscount, shippingFee } from "@shared/pricing";
import { addressSchema, checkoutSchema, isValidPincode, normalizeIndianPhone, passwordSchema, phoneSchema } from "@shared/validation";

describe("money", () => {
  it("formats paise as Indian rupees", () => {
    expect(formatINR(119900)).toBe("₹1,199");
    expect(formatINR(12345678)).toBe("₹1,23,456.78");
  });
  it("never overstates a discount", () => {
    expect(discountPercent(699, 1000)).toBe(30);
    expect(discountPercent(701, 1000)).toBe(29); // 29.9% rounds down
    expect(discountPercent(1000, 1000)).toBe(0);
    expect(discountPercent(1200, 1000)).toBe(0);
    expect(discountPercent(1000, null)).toBe(0);
  });
  it("matches integer arithmetic exactly (no floating point drift)", () => {
    for (let compare = 100; compare < 5000; compare += 37) {
      for (let price = 1; price < compare; price += 53) {
        // BigInt division is exact integer division — the same rule as the database CHECK constraint.
        expect(discountPercent(price, compare)).toBe(Number((BigInt(compare - price) * 100n) / BigInt(compare)));
      }
    }
  });
});

describe("order state machine", () => {
  it("only allows listed transitions", () => {
    expect(canTransition("PENDING_PAYMENT", "CONFIRMED")).toBe(true);
    expect(canTransition("PENDING_PAYMENT", "DELIVERED")).toBe(false);
    expect(canTransition("CONFIRMED", "SHIPPED")).toBe(false);
    expect(canTransition("SHIPPED", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransition("REFUNDED", "DELIVERED")).toBe(false);
  });
  it("has terminal states and no self-loops", () => {
    for (const s of ORDER_STATUSES) expect(ORDER_TRANSITIONS[s]).not.toContain(s);
    expect(ORDER_TRANSITIONS.CANCELLED).toEqual([]);
    expect(ORDER_TRANSITIONS.REFUNDED).toEqual([]);
  });
  it("never lets admins confirm payment or record refunds by hand", () => {
    for (const from of ORDER_STATUSES) {
      expect(adminCanSet(from, "CONFIRMED")).toBe(false);
      expect(adminCanSet(from, "REFUNDED")).toBe(false);
      expect(adminCanSet(from, "RETURNED")).toBe(false);
    }
    // ...and every manual move is also a valid graph edge.
    for (const from of ORDER_STATUSES) for (const to of ORDER_STATUSES) if (adminCanSet(from, to)) expect(canTransition(from, to)).toBe(true);
  });
});

describe("pricing", () => {
  const pct = { type: "PERCENTAGE" as const, value: 10, maxDiscountPaise: 20000, minSubtotalPaise: 100000 };
  it("applies percentage coupons with a cap and minimum", () => {
    expect(couponDiscount(pct, 99999)).toBe(0);
    expect(couponDiscount(pct, 150000)).toBe(15000);
    expect(couponDiscount(pct, 500000)).toBe(20000);
  });
  it("never discounts more than the subtotal", () => {
    expect(couponDiscount({ type: "FIXED", value: 50000, maxDiscountPaise: null, minSubtotalPaise: 0 }, 30000)).toBe(30000);
  });
  it("gives free shipping above the threshold, after discounts", () => {
    const rule = { feePaise: 7900, freeAbovePaise: 99900 };
    expect(shippingFee(rule, 99900)).toBe(0);
    expect(shippingFee(rule, 99899)).toBe(7900);
    const totals = computeTotals([{ unitPricePaise: 60000, quantity: 2 }], { type: "FIXED", value: 30000, maxDiscountPaise: null, minSubtotalPaise: 0 }, rule);
    expect(totals).toEqual({ subtotalPaise: 120000, discountPaise: 30000, shippingPaise: 7900, totalPaise: 97900 });
  });
});

describe("Indian validation", () => {
  it("normalises and validates mobile numbers", () => {
    expect(normalizeIndianPhone("+91 98765-43210")).toBe("9876543210");
    expect(normalizeIndianPhone("09876543210")).toBe("9876543210");
    expect(phoneSchema.safeParse("98765 43210").success).toBe(true);
    expect(phoneSchema.safeParse("5876543210").success).toBe(false); // must start 6–9
    expect(phoneSchema.safeParse("98765").success).toBe(false);
  });
  it("validates six-digit PIN codes", () => {
    expect(isValidPincode("641604")).toBe(true);
    expect(isValidPincode("041604")).toBe(false);
    expect(isValidPincode("64160")).toBe(false);
  });
  it("requires a known state and strips unknown fields", () => {
    const base = { fullName: "Priya", phone: "9876543210", line1: "12 Street", city: "Tiruppur", pincode: "641604" };
    expect(addressSchema.safeParse({ ...base, state: "Atlantis" }).success).toBe(false);
    const ok = addressSchema.parse({ ...base, state: "Tamil Nadu", userId: "someone-else" });
    expect(ok).not.toHaveProperty("userId");
  });
  it("requires exactly one of a saved or new address at checkout", () => {
    const base = { contact: { email: "a@b.co", phone: "9876543210" }, shippingMethodCode: "standard", paymentMethod: "COD" };
    expect(checkoutSchema.safeParse(base).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, addressId: "x" }).success).toBe(true);
  });
  it("enforces the password policy", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("allletters").success).toBe(false);
    expect(passwordSchema.safeParse("Sunflower2026").success).toBe(true);
  });
});

describe("catalogue rules", () => {
  it("detects adult men's fashion terms but allows women's and boys'", () => {
    for (const bad of ["Men", "Men's Shirts", "mens-wear", "Gents Kurta", "For Him", "Male Collection"]) expect(describesMensFashion(bad)).toBe(true);
    for (const good of ["Women", "Women's Kurtis", "women-dresses", "Boys", "Boys' T-Shirts", "Mentionable Basics"]) expect(describesMensFashion(good)).toBe(false);
  });
  it("formats catalogue age guidance", () => {
    expect(formatAgeRange(0, 12)).toBe("0–12 months");
    expect(formatAgeRange(24, 36)).toBe("2–3 years");
    expect(formatAgeRange(18, 36)).toBe("18 months – 3 years");
    expect(formatAgeRange(null, null)).toBeNull();
  });
  it("parses listing filters from a query string", () => {
    const q = productListQuerySchema.parse({ sizes: "S, M", inStock: "1", minPrice: "500", sort: "price-asc", page: "2" });
    expect(q).toMatchObject({ sizes: ["S", "M"], inStock: true, minPrice: 500, sort: "price-asc", page: 2 });
    expect(productListQuerySchema.safeParse({ sort: "random" }).success).toBe(false);
  });
});
