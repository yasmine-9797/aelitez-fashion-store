// Admin API types and helpers. The server enforces every permission; the UI only hides what a
// role cannot use.
import type { OrderPaymentStatus, OrderStatus, PaymentMethod } from "@shared/order-status";
import type { OrderDetailDTO, Role } from "@shared/types";
import type { Department, SizeGroup } from "@shared/catalog";

export type Perm = "refunds" | "coupons" | "settings" | "audit" | "newsletter";
const ADMIN_ONLY: Perm[] = ["refunds", "coupons", "settings", "audit", "newsletter"];
export const can = (role: Role | undefined, perm: Perm) => role === "ADMIN" || (role === "STAFF" && !ADMIN_ONLY.includes(perm));
export const isStaff = (role: Role | undefined) => role === "ADMIN" || role === "STAFF";

export interface Dashboard {
  orders: { total: number; awaitingPayment: number; toFulfil: number; requiresRefund: number; openReturns: number };
  revenue: { paidPaise: number; paidOrders: number };
  products: Partial<Record<"DRAFT" | "ACTIVE" | "ARCHIVED", number>>;
  stock: { lowStockVariants: number; outOfStockVariants: number };
  recentOrders: { id: string; orderNumber: string; customer: string; status: OrderStatus; paymentStatus: OrderPaymentStatus; totalPaise: number; createdAt: string }[];
  salesTrend: { day: string; revenuePaise: number; orders: number }[];
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  customer: string;
  email: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: PaymentMethod;
  totalPaise: number;
  itemCount: number;
  requiresRefund: boolean;
  createdAt: string;
}

export interface ReturnRow {
  id: string;
  orderId: string;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "RECEIVED" | "REFUNDED";
  reason: string;
  details: string | null;
  adminNote: string | null;
  createdAt: string;
}

export interface AdminOrder extends OrderDetailDTO {
  customer: { id: string; name: string; email: string };
  requiresRefund: boolean;
  allowedStatuses: OrderStatus[];
  payments: { id: string; provider: PaymentMethod; status: string; amountPaise: number; providerPaymentId: string | null; method: string | null; errorDescription: string | null; capturedAt: string | null }[];
  refunds: { id: string; status: string; amountPaise: number; providerRefundId: string | null; manualReference: string | null; createdAt: string }[];
  returnRequests: ReturnRow[];
}

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  department: Department;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  pricePaise: number;
  compareAtPaise: number | null;
  image: string | null;
  variantCount: number;
  stockOnHand: number;
  soldCount: number;
  updatedAt: string;
}

export interface AdminSize {
  id: string;
  label: string;
  group: SizeGroup;
  ageGuidance: string | null;
  sortOrder: number;
}
export interface AdminColor {
  id: string;
  name: string;
  hex: string;
}

export interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  fabric: string | null;
  care: string | null;
  specs: { label: string; value: string }[] | null;
  department: Department;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  pricePaise: number;
  compareAtPaise: number | null;
  discountPercent: number;
  ageMinMonths: number | null;
  ageMaxMonths: number | null;
  isFeatured: boolean;
  soldCount: number;
  publishedAt: string | null;
  categories: { category: { id: string; name: string; slug: string } }[];
  images: { id: string; url: string; alt: string; sortOrder: number; colorId: string | null; width: number | null; height: number | null }[];
  variants: {
    id: string;
    sku: string;
    pricePaise: number | null;
    isActive: boolean;
    size: AdminSize;
    color: AdminColor;
    inventory: { onHand: number; reserved: number; lowStockThreshold: number } | null;
  }[];
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  department: Department;
  parentId: string | null;
  description: string | null;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  _count: { products: number; children: number };
}

export interface InventoryRow {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  size: string;
  color: string;
  isActive: boolean;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  maxDiscountPaise: number | null;
  minSubtotalPaise: number;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  isActive: boolean;
  timesUsed: number;
}

export interface ShippingMethodRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  feePaise: number;
  freeAbovePaise: number | null;
  minDays: number;
  maxDays: number;
  codAllowed: boolean;
  isActive: boolean;
  sortOrder: number;
}

export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** "1,499" (rupees, as typed in admin forms) → paise. */
export const rupeesInput = (v: string): number | null => {
  const n = Number(v.replace(/[,\s₹]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : Math.round(n * 100);
};
export const paiseToInput = (p: number | null | undefined) => (p == null ? "" : String(p / 100));
