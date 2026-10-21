// Opens Razorpay Checkout. Card/UPI details are entered on Razorpay's own form — they never pass
// through our code. The success callback only gives us ids + a signature, which the API verifies.
import type { CheckoutResultDTO } from "@shared/types";

type RazorpayParams = NonNullable<CheckoutResultDTO["razorpay"]>;
export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (r: unknown) => void) => void };
  }
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Resolves with the payment ids on success; rejects with "dismissed" if the customer closes the window. */
export async function payWithRazorpay(params: RazorpayParams, description: string): Promise<RazorpaySuccess> {
  await loadScript();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Payment window unavailable.");
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: params.keyId,
      order_id: params.orderId,
      amount: params.amountPaise,
      currency: params.currency,
      name: "AELITEZ CLOTHINGS",
      description,
      prefill: { name: params.name, email: params.email, contact: params.phone },
      theme: { color: "#e11d24" },
      handler: (r: RazorpaySuccess) => resolve(r),
      modal: { ondismiss: () => reject(new Error("dismissed")) },
    });
    rzp.on("payment.failed", () => {
      /* Razorpay shows the error and lets the customer retry inside the window. */
    });
    rzp.open();
  });
}
