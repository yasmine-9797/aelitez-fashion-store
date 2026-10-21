import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ExternalLink, PartyPopper, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { formatINR } from "@shared/money";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, TRACKING_STEPS, trackingStepIndex } from "@shared/order-status";
import type { OrderDetailDTO } from "@shared/types";
import { RETURN_REASONS, type ReturnReason } from "@shared/validation";
import { AddressText } from "@/components/shop/AddressForm";
import { Alert, Button, SelectField, Spinner, TextAreaField } from "@/components/shop/ui";
import { api, isApiError } from "@/lib/api";
import { qk, useCancelOrder, useConfig, useOrder, useRequestReturn } from "@/lib/queries";
import { payWithRazorpay } from "@/lib/razorpay";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_store/account/orders/$id")({
  validateSearch: (s) => z.object({ placed: z.coerce.boolean().optional().catch(undefined) }).parse(s),
  component: OrderPage,
});

const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

function OrderPage() {
  const { id } = Route.useParams();
  const { placed } = Route.useSearch();
  const order = useOrder(id);
  if (order.isLoading) return <Spinner label="Loading order" />;
  if (order.isError || !order.data) return <Alert tone="error">{isApiError(order.error) && order.error.status === 404 ? "We couldn't find that order on your account." : "Couldn't load this order."}</Alert>;
  const o = order.data;
  return (
    <div className="space-y-10">
      {placed && o.status !== "PENDING_PAYMENT" && o.status !== "CANCELLED" && (
        <Alert tone="success" title="Thank you — your order is confirmed!">
          <span className="inline-flex items-center gap-2">
            <PartyPopper className="size-4" aria-hidden /> We'll email updates to {o.email}.
          </span>
        </Alert>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Order</p>
          <h2 className="display text-4xl md:text-5xl">{o.orderNumber}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Placed {fmtDate(o.createdAt)}</p>
        </div>
        <div className="text-right text-sm">
          <p className={cn("text-lg font-bold", o.status === "CANCELLED" || o.status === "PENDING_PAYMENT" ? "text-brand" : "")}>{ORDER_STATUS_LABEL[o.status]}</p>
          <p className="text-muted-foreground">
            {PAYMENT_METHOD_LABEL[o.paymentMethod]} · {PAYMENT_STATUS_LABEL[o.paymentStatus]}
          </p>
        </div>
      </div>

      {o.status === "PENDING_PAYMENT" && <PayNow order={o} />}
      <Tracking order={o} />

      <section aria-labelledby="items-title">
        <h3 id="items-title" className="text-lg font-bold">
          Items
        </h3>
        <ul className="mt-3 divide-y border-y">
          {o.items.map((i) => (
            <li key={i.id} className="flex gap-4 py-4">
              {i.imageUrl ? <img src={i.imageUrl} alt="" loading="lazy" className="h-24 w-20 shrink-0 object-cover" /> : <div className="h-24 w-20 bg-card" />}
              <div className="flex-1 text-sm">
                <Link to="/products/$slug" params={{ slug: i.productSlug }} className="font-semibold hover:underline">
                  {i.productName}
                </Link>
                <p className="text-muted-foreground">
                  {i.color} · Size {i.size} · SKU {i.sku}
                </p>
                <p>
                  {formatINR(i.unitPricePaise)} × {i.quantity}
                </p>
              </div>
              <p className="font-bold">{formatINR(i.lineTotalPaise)}</p>
            </li>
          ))}
        </ul>
        <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatINR(o.subtotalPaise)}</dd>
          </div>
          {o.discountPaise > 0 && (
            <div className="flex justify-between text-brand">
              <dt>Discount {o.couponCode ? `(${o.couponCode})` : ""}</dt>
              <dd>−{formatINR(o.discountPaise)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Delivery ({o.shippingMethod.name})</dt>
            <dd>{o.shippingPaise === 0 ? "Free" : formatINR(o.shippingPaise)}</dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd>{formatINR(o.totalPaise)}</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-8 sm:grid-cols-2">
        <section>
          <h3 className="text-lg font-bold">Delivery address</h3>
          <div className="mt-3">
            <AddressText a={o.shippingAddress} />
          </div>
        </section>
        <section>
          <h3 className="text-lg font-bold">Contact</h3>
          <p className="mt-3 text-sm">
            {o.email}
            <br />
            +91 {o.phone}
          </p>
        </section>
      </div>

      <Actions order={o} />
    </div>
  );
}

function Tracking({ order: o }: { order: OrderDetailDTO }) {
  const reached = trackingStepIndex(o.status);
  const at = (status: string) => o.events.find((e) => e.status === status)?.createdAt;
  return (
    <section aria-labelledby="track-title" className="border p-6">
      <h3 id="track-title" className="text-lg font-bold">
        Order tracking
      </h3>
      {o.status === "CANCELLED" ? (
        <p className="mt-3 text-sm">
          This order was cancelled{o.cancelledAt ? ` on ${fmtDate(o.cancelledAt)}` : ""}.{o.cancelReason ? ` Reason: ${o.cancelReason}.` : ""}
          {o.paymentStatus === "PAID" && " Your refund is being processed to the original payment method."}
          {o.paymentStatus === "REFUNDED" && " Your payment has been refunded."}
        </p>
      ) : (
        <ol className="mt-5 grid gap-4 sm:grid-cols-5">
          {TRACKING_STEPS.map((step, i) => {
            const done = i <= reached;
            const when = at(step);
            return (
              <li key={step} className="flex items-start gap-3 sm:flex-col">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border-2", done ? "border-brand bg-brand text-paper" : "border-border text-muted-foreground")}>{done ? <Check className="size-4" /> : i + 1}</span>
                <span className="text-sm">
                  <span className={cn("block font-semibold", !done && "text-muted-foreground")}>{ORDER_STATUS_LABEL[step]}</span>
                  {when && <span className="text-xs text-muted-foreground">{fmtDate(when)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {(o.status === "RETURN_REQUESTED" || o.status === "RETURNED" || o.status === "REFUNDED") && (
        <p className="mt-4 text-sm font-semibold">
          Return: {ORDER_STATUS_LABEL[o.status]}
          {o.returnRequest ? ` · ${o.returnRequest.reason}` : ""}
        </p>
      )}
      {o.shipment && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
          <Truck className="size-5 text-brand" aria-hidden />
          <span>
            Shipped with <strong>{o.shipment.carrier}</strong>
            {o.shipment.trackingNumber && <> · Tracking no. <strong>{o.shipment.trackingNumber}</strong></>}
          </span>
          {o.shipment.trackingUrl && (
            <a href={o.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-brand underline">
              Track shipment <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      )}
      {o.status !== "CANCELLED" && reached < TRACKING_STEPS.length - 1 && reached >= 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Estimated delivery: {o.shippingMethod.minDays}–{o.shippingMethod.maxDays} business days after dispatch.
        </p>
      )}
    </section>
  );
}

function PayNow({ order: o }: { order: OrderDetailDTO }) {
  const config = useConfig();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (o.paymentMethod !== "RAZORPAY") return null;
  const expires = o.reservationExpiresAt ? new Date(o.reservationExpiresAt) : null;
  const pay = async () => {
    setBusy(true);
    try {
      const params = await api<Parameters<typeof payWithRazorpay>[0]>("/payments/create-order", { method: "POST", body: { orderId: o.id } });
      const r = await payWithRazorpay(params, `Order ${o.orderNumber}`);
      const res = await api<{ status: string }>("/payments/verify", { method: "POST", body: { orderId: o.id, razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature } });
      if (res.status === "paid") toast.success("Payment received — thank you!");
      else toast("Payment is being confirmed", { description: "This page will update once Razorpay confirms it." });
    } catch (err) {
      if ((err as Error).message !== "dismissed") toast.error(isApiError(err) ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: qk.order(o.id) });
    }
  };
  return (
    <Alert tone="error" title="Payment pending">
      <p>
        Your items are reserved{expires ? ` until ${expires.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}. Complete payment to confirm the order — otherwise it will be cancelled automatically and no money will be taken.
      </p>
      {config.data?.payments.razorpay.enabled ? (
        <Button className="mt-3" onClick={pay} loading={busy}>
          Pay {formatINR(o.totalPaise)} now
        </Button>
      ) : (
        <p className="mt-2">Online payment is currently unavailable.</p>
      )}
    </Alert>
  );
}

function Actions({ order: o }: { order: OrderDetailDTO }) {
  const cancel = useCancelOrder();
  const ret = useRequestReturn();
  const config = useConfig();
  const [showReturn, setShowReturn] = useState(false);
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [details, setDetails] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  if (!o.canCancel && !o.canRequestReturn) return null;
  return (
    <section className="space-y-4 border-t pt-8">
      {o.canCancel && (
        <div>
          <Button
            variant="outline"
            loading={cancel.isPending}
            onClick={() => {
              if (!window.confirm("Cancel this order? Reserved items will be released.")) return;
              cancel.mutate({ id: o.id }, { onSuccess: () => toast("Order cancelled"), onError: (e) => toast.error(isApiError(e) ? e.message : "Couldn't cancel the order") });
            }}
          >
            Cancel order
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">You can cancel until the store starts preparing your order.</p>
        </div>
      )}
      {o.canRequestReturn &&
        (!showReturn ? (
          <div>
            <Button variant="outline" onClick={() => setShowReturn(true)}>
              Request a return
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">Returns can be requested within {config.data?.returnWindowDays ?? 7} days of delivery.</p>
          </div>
        ) : (
          <form
            className="max-w-lg space-y-4 border p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason) return setReasonError("Choose a reason");
              ret.mutate({ id: o.id, reason, details: details || undefined }, { onSuccess: () => toast.success("Return requested", { description: "We'll be in touch about pickup." }), onError: (err) => toast.error(isApiError(err) ? err.message : "Couldn't request a return") });
            }}
          >
            <p className="font-bold">Request a return</p>
            <SelectField label="Reason" value={reason} onChange={(e) => { setReason(e.target.value as ReturnReason); setReasonError(undefined); }} error={reasonError}>
              <option value="">Select a reason</option>
              {(Object.entries(RETURN_REASONS) as [ReturnReason, string][]).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectField>
            <TextAreaField label="Details" optional value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
            <div className="flex gap-3">
              <Button type="submit" loading={ret.isPending}>
                Submit request
              </Button>
              <Button variant="outline" onClick={() => setShowReturn(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ))}
    </section>
  );
}
