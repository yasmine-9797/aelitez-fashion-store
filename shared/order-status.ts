// Order lifecycle — the single source of truth for which status changes are allowed.

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURNED",
  "REFUNDED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["UNPAID", "PAID", "FAILED", "REFUNDED"] as const;
export type OrderPaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["RAZORPAY", "COD"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Every permitted edge of the order state graph. Anything not listed is rejected. */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["RETURN_REQUESTED"],
  // Back to DELIVERED means the return request was rejected.
  RETURN_REQUESTED: ["RETURNED", "DELIVERED"],
  RETURNED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

/**
 * Transitions an administrator may apply directly from the order screen. The rest happen
 * only through their dedicated workflow (payment verification, returns, refunds), so an
 * unpaid order can never be pushed to CONFIRMED or a refund recorded without a refund.
 */
export const ADMIN_MANUAL_TRANSITIONS: Readonly<Partial<Record<OrderStatus, readonly OrderStatus[]>>> = {
  PENDING_PAYMENT: ["CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function adminCanSet(from: OrderStatus, to: OrderStatus): boolean {
  return (ADMIN_MANUAL_TRANSITIONS[from] ?? []).includes(to);
}

/** Statuses in which a customer may still cancel the order themselves. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ["PENDING_PAYMENT", "CONFIRMED"];

export const ORDER_STATUS_LABEL: Readonly<Record<OrderStatus, string>> = {
  PENDING_PAYMENT: "Pending payment",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURN_REQUESTED: "Return requested",
  RETURNED: "Returned",
  REFUNDED: "Refunded",
};

export const PAYMENT_STATUS_LABEL: Readonly<Record<OrderPaymentStatus, string>> = {
  UNPAID: "Unpaid",
  PAID: "Paid",
  FAILED: "Payment failed",
  REFUNDED: "Refunded",
};

export const PAYMENT_METHOD_LABEL: Readonly<Record<PaymentMethod, string>> = {
  RAZORPAY: "Online payment (Razorpay)",
  COD: "Cash on delivery",
};

/** The happy-path steps shown on the customer tracking timeline. */
export const TRACKING_STEPS: readonly OrderStatus[] = ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"];

/** Index of the furthest tracking step reached, or -1 (pending / cancelled before confirmation). */
export function trackingStepIndex(status: OrderStatus): number {
  if (status === "RETURN_REQUESTED" || status === "RETURNED" || status === "REFUNDED") return TRACKING_STEPS.length - 1;
  return TRACKING_STEPS.indexOf(status);
}
