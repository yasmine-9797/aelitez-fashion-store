// Minimal Razorpay REST client + signature verification. Card data never touches our servers:
// customers pay inside Razorpay Checkout and we only receive ids and signatures.
import { env, razorpayEnabled } from "../config/env.ts";
import { hmacSha256Hex, safeEqual } from "./crypto.ts";
import { AppError, serviceUnavailable } from "./errors.ts";

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}
export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string;
  error_code?: string | null;
  error_description?: string | null;
}
export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: "pending" | "processed" | "failed";
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
let fetchImpl: FetchLike = (input, init) => fetch(input, init);
/** Test hook: route gateway calls to a fake. */
export function setRazorpayFetch(impl: FetchLike | null): void {
  fetchImpl = impl ?? ((input, init) => fetch(input, init));
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!razorpayEnabled) throw serviceUnavailable("Online payments are not configured yet.", "PAYMENTS_NOT_CONFIGURED");
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  let res: Response;
  try {
    res = await fetchImpl(`${env.RAZORPAY_API_BASE}${path}`, {
      method,
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(502, "PAYMENT_GATEWAY_UNAVAILABLE", "The payment gateway could not be reached. Please try again.");
  }
  if (!res.ok) {
    throw new AppError(502, "PAYMENT_GATEWAY_ERROR", "The payment gateway rejected the request. Please try again.");
  }
  return (await res.json()) as T;
}

export const razorpay = {
  createOrder: (amountPaise: number, receipt: string, notes: Record<string, string>) =>
    call<RazorpayOrder>("POST", "/orders", { amount: amountPaise, currency: "INR", receipt, notes }),
  fetchPayment: (paymentId: string) => call<RazorpayPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`),
  capturePayment: (paymentId: string, amountPaise: number) =>
    call<RazorpayPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: "INR" }),
  createRefund: (paymentId: string, amountPaise: number, notes: Record<string, string>) =>
    call<RazorpayRefund>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, notes }),
};

/** Checkout callback signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  return safeEqual(hmacSha256Hex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
}

/** Webhook signature: HMAC-SHA256(raw request body, webhook_secret). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  return safeEqual(hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
}
