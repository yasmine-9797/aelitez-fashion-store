import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Lock } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { formatINR } from "@shared/money";
import { contactSchema, type AddressInput } from "@shared/validation";
import { AddressForm, AddressText } from "@/components/shop/AddressForm";
import { SmartImage } from "@/components/shop/SmartImage";
import { Alert, Button, ButtonLink, CheckboxField, Container, EmptyState, Spinner, TextField } from "@/components/shop/ui";
import { api, isApiError } from "@/lib/api";
import { useAddresses, useCart, useConfig, useMe, usePlaceOrder, useQuote, useShippingMethods } from "@/lib/queries";
import { payWithRazorpay } from "@/lib/razorpay";
import { privateHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_store/checkout")({
  head: () => privateHead("Checkout"),
  component: Checkout,
});

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="border-b py-8 first:pt-0">
      <h2 id={`step-${n}`} className="mb-5 flex items-center gap-3 text-lg font-bold">
        <span className={cn("grid size-8 place-items-center rounded-full text-sm", done ? "bg-ink text-paper" : "border-2 border-ink")}>{done ? <Check className="size-4" /> : n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Checkout() {
  const me = useMe();
  const navigate = useNavigate();
  const cart = useCart();
  const config = useConfig();
  const methods = useShippingMethods();
  const addresses = useAddresses(Boolean(me.data));
  const place = usePlaceOrder();

  const [contact, setContact] = useState({ email: "", phone: "" });
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [addressId, setAddressId] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState<AddressInput | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saveAddress, setSaveAddress] = useState(true);
  const [shippingCode, setShippingCode] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | undefined>();
  const [payment, setPayment] = useState<"RAZORPAY" | "COD" | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  // Sign-in is required to check out; the guest bag merges into the account.
  useEffect(() => {
    if (me.isSuccess && !me.data) void navigate({ to: "/login", search: { redirect: "/checkout" }, replace: true });
  }, [me.isSuccess, me.data, navigate]);
  useEffect(() => {
    if (me.data) setContact((c) => ({ email: c.email || me.data!.email, phone: c.phone || me.data!.phone || "" }));
  }, [me.data]);
  useEffect(() => {
    const list = addresses.data;
    if (!list) return;
    if (!list.length) setShowForm(true);
    else if (!addressId) setAddressId((list.find((a) => a.isDefault) ?? list[0])!.id);
  }, [addresses.data, addressId]);
  useEffect(() => {
    if (!shippingCode && methods.data?.[0]) setShippingCode(methods.data[0].code);
  }, [methods.data, shippingCode]);

  const method = methods.data?.find((m) => m.code === shippingCode) ?? null;
  const canRazorpay = Boolean(config.data?.payments.razorpay.enabled);
  const canCod = Boolean(config.data?.payments.cod.enabled && method?.codAllowed);
  const paymentOptions = useMemo(() => [...(canRazorpay ? ["RAZORPAY" as const] : []), ...(canCod ? ["COD" as const] : [])], [canRazorpay, canCod]);
  useEffect(() => {
    if (payment && !paymentOptions.includes(payment)) setPayment(null);
    if (!payment && paymentOptions.length) setPayment(paymentOptions[0]!);
  }, [paymentOptions, payment]);

  const quote = useQuote({ shippingMethodCode: shippingCode ?? undefined, couponCode: coupon }, Boolean(me.data && cart.data?.items.length && shippingCode));
  const q = quote.data;

  if (me.isLoading || !me.data || cart.isLoading) {
    return (
      <Container className="py-16">
        <Spinner label="Preparing checkout" />
      </Container>
    );
  }
  if (!cart.data?.items.length) {
    return (
      <Container className="py-16">
        <EmptyState title="Your bag is empty" body="Add something you love, then come back to check out." action={<ButtonLink to="/shop">Shop now</ButtonLink>} />
      </Container>
    );
  }

  const contactOk = contactSchema.safeParse(contact).success;
  const addressOk = Boolean(addressId && !showForm) || Boolean(newAddress);
  const ready = contactOk && addressOk && Boolean(method) && Boolean(payment) && cart.data.purchasable && !place.isPending && !paying;

  const placeOrder = () => {
    setPlaceError(null);
    const parsed = contactSchema.safeParse(contact);
    if (!parsed.success) {
      setContactErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      document.getElementById("step-1")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (!method || !payment) return;
    place.mutate(
      {
        contact: parsed.data,
        ...(newAddress && showForm ? { address: newAddress, saveAddress } : { addressId: addressId! }),
        shippingMethodCode: method.code,
        paymentMethod: payment,
        ...(q?.coupon ? { couponCode: q.coupon.code } : {}),
      },
      {
        onSuccess: async (result) => {
          const orderPath = { to: "/account/orders/$id" as const, params: { id: result.order.id }, search: { placed: true } };
          if (!result.razorpay) return void navigate(orderPath);
          setPaying(true);
          try {
            const r = await payWithRazorpay(result.razorpay, `Order ${result.order.orderNumber}`);
            await api("/payments/verify", { method: "POST", body: { orderId: result.order.id, razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature } });
          } catch (err) {
            if ((err as Error).message !== "dismissed") toast.error(isApiError(err) ? err.message : (err as Error).message);
            else toast("Payment not completed", { description: "Your order is saved — you can pay from your order page before the reservation expires." });
          } finally {
            setPaying(false);
            void navigate(orderPath);
          }
        },
        onError: (err) => setPlaceError(isApiError(err) ? err.message : "We couldn't place your order. Please try again."),
      },
    );
  };

  return (
    <Container className="py-10 md:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-6xl md:text-7xl">Checkout</h1>
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden /> Secure checkout · prices confirmed by our servers
        </p>
      </div>
      <div className="mt-10 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Step n={1} title="Contact information" done={contactOk}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Email" type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} error={contactErrors["email"]} hint="We'll send order updates here." />
              <TextField label="Mobile number" type="tel" inputMode="tel" autoComplete="tel-national" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} error={contactErrors["phone"]} hint="For delivery updates from the courier." />
            </div>
          </Step>

          <Step n={2} title="Delivery address" done={addressOk}>
            {addresses.isLoading ? (
              <Spinner label="Loading addresses" />
            ) : (
              <>
                {(addresses.data ?? []).length > 0 && !showForm && (
                  <fieldset>
                    <legend className="sr-only">Saved addresses</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {addresses.data!.map((a) => (
                        <label key={a.id} className={cn("flex cursor-pointer gap-3 border-2 p-4", addressId === a.id ? "border-ink" : "border-border hover:border-muted-foreground")}>
                          <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1 size-4 accent-brand" />
                          <AddressText a={a} />
                        </label>
                      ))}
                    </div>
                    <button type="button" onClick={() => setShowForm(true)} className="mt-4 text-sm font-bold text-brand underline underline-offset-4">
                      + Deliver to a new address
                    </button>
                  </fieldset>
                )}
                {showForm &&
                  (newAddress ? (
                    <div className="flex items-start justify-between gap-4 border-2 border-ink p-4">
                      <AddressText a={{ ...newAddress, line2: newAddress.line2 ?? null, landmark: newAddress.landmark ?? null }} />
                      <button type="button" onClick={() => setNewAddress(null)} className="text-sm font-bold underline">
                        Edit
                      </button>
                    </div>
                  ) : (
                    <AddressForm
                      showDefault={false}
                      submitLabel="Use this address"
                      onSubmit={async (values) => setNewAddress(values)}
                      {...((addresses.data ?? []).length ? { onCancel: () => setShowForm(false) } : {})}
                      extra={<CheckboxField label="Save this address to my account" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />}
                    />
                  ))}
              </>
            )}
          </Step>

          <Step n={3} title="Delivery option" done={Boolean(method)}>
            {!methods.data?.length ? (
              <Alert tone="error">Delivery options haven't been set up yet, so orders can't be placed right now.</Alert>
            ) : (
              <fieldset className="space-y-3">
                <legend className="sr-only">Delivery options</legend>
                {methods.data.map((m) => {
                  const fee = shippingCode === m.code && q ? q.shippingPaise : m.freeAbovePaise != null && (cart.data?.subtotalPaise ?? 0) >= m.freeAbovePaise ? 0 : m.feePaise;
                  return (
                    <label key={m.code} className={cn("flex cursor-pointer items-start gap-3 border-2 p-4", shippingCode === m.code ? "border-ink" : "border-border hover:border-muted-foreground")}>
                      <input type="radio" name="shipping" checked={shippingCode === m.code} onChange={() => setShippingCode(m.code)} className="mt-1 size-4 accent-brand" />
                      <span className="flex-1">
                        <span className="flex justify-between gap-4 font-semibold">
                          {m.name} <span>{fee === 0 ? "Free" : formatINR(fee)}</span>
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          Estimated {m.minDays}–{m.maxDays} business days{m.freeAbovePaise != null ? ` · free above ${formatINR(m.freeAbovePaise)}` : ""}
                          {!m.codAllowed && config.data?.payments.cod.enabled ? " · cash on delivery not available" : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </Step>

          <Step n={4} title="Offers" done={Boolean(q?.coupon)}>
            <form
              className="flex gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setCoupon(couponInput.trim() || undefined);
              }}
            >
              <label htmlFor="coupon" className="sr-only">
                Coupon code
              </label>
              <input id="coupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Coupon code" className="w-full border px-4 py-3 uppercase tracking-widest outline-none focus:border-ink" />
              <Button type="submit" variant="dark" loading={quote.isFetching && Boolean(coupon)}>
                Apply
              </Button>
            </form>
            {coupon && q?.couponError && <p className="mt-2 text-sm font-semibold text-brand">{q.couponError}</p>}
            {q?.coupon && (
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
                <Check className="size-4 text-brand" /> {q.coupon.code} applied — you save {formatINR(q.discountPaise)}
                <button
                  type="button"
                  className="ml-2 text-muted-foreground underline"
                  onClick={() => {
                    setCoupon(undefined);
                    setCouponInput("");
                  }}
                >
                  Remove
                </button>
              </p>
            )}
          </Step>

          <Step n={5} title="Payment" done={Boolean(payment)}>
            {config.isLoading ? (
              <Spinner />
            ) : paymentOptions.length === 0 ? (
              <Alert tone="info" title="Payment isn't available yet">
                Online payment and cash on delivery haven't been switched on for this store yet, so orders can't be placed online. Please visit our Tiruppur store or message us on Instagram.
              </Alert>
            ) : (
              <fieldset className="space-y-3">
                <legend className="sr-only">Payment method</legend>
                {canRazorpay && (
                  <label className={cn("flex cursor-pointer items-start gap-3 border-2 p-4", payment === "RAZORPAY" ? "border-ink" : "border-border")}>
                    <input type="radio" name="payment" checked={payment === "RAZORPAY"} onChange={() => setPayment("RAZORPAY")} className="mt-1 size-4 accent-brand" />
                    <span>
                      <span className="block font-semibold">Pay online — UPI, cards, net banking, wallets</span>
                      <span className="text-sm text-muted-foreground">Processed securely by Razorpay. We never see or store your card details.</span>
                    </span>
                  </label>
                )}
                {config.data?.payments.cod.enabled && (
                  <label className={cn("flex items-start gap-3 border-2 p-4", !canCod ? "cursor-not-allowed opacity-60" : "cursor-pointer", payment === "COD" ? "border-ink" : "border-border")}>
                    <input type="radio" name="payment" disabled={!canCod} checked={payment === "COD"} onChange={() => setPayment("COD")} className="mt-1 size-4 accent-brand" />
                    <span>
                      <span className="block font-semibold">Cash on delivery</span>
                      <span className="text-sm text-muted-foreground">{canCod ? "Pay in cash when your order arrives." : "Not available for the selected delivery option."}</span>
                    </span>
                  </label>
                )}
              </fieldset>
            )}
          </Step>
        </div>

        <aside className="h-fit bg-card p-6 lg:sticky lg:top-28 lg:col-span-5" aria-label="Order summary">
          <h2 className="text-lg font-bold">Order summary</h2>
          <ul className="mt-4 max-h-80 divide-y overflow-y-auto">
            {cart.data.items.map((i) => (
              <li key={i.id} className="flex gap-3 py-3">
                {i.image ? <SmartImage src={i.image.url} alt="" width={160} sizes="64px" className="h-20 w-16 shrink-0 object-cover" /> : <div className="h-20 w-16 bg-muted" />}
                <div className="flex-1 text-sm">
                  <p className="font-semibold">{i.productName}</p>
                  <p className="text-muted-foreground">
                    {i.color} · {i.size} · Qty {i.quantity}
                  </p>
                  {i.issue && <p className="font-semibold text-brand">Needs attention in your bag</p>}
                </div>
                <p className="text-sm font-bold">{formatINR(i.lineTotalPaise)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatINR(q?.subtotalPaise ?? cart.data.subtotalPaise)}</dd>
            </div>
            {(q?.discountPaise ?? 0) > 0 && (
              <div className="flex justify-between text-brand">
                <dt>Discount ({q!.coupon?.code})</dt>
                <dd>−{formatINR(q!.discountPaise)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Delivery</dt>
              <dd>{q && method ? (q.shippingPaise === 0 ? "Free" : formatINR(q.shippingPaise)) : "—"}</dd>
            </div>
            <div className="flex justify-between border-t pt-3 text-lg font-bold">
              <dt>Total</dt>
              <dd>{formatINR(q?.totalPaise ?? cart.data.subtotalPaise)}</dd>
            </div>
            <p className="text-xs text-muted-foreground">Inclusive of all taxes. The final amount is confirmed by our servers when you place the order.</p>
          </dl>
          {!cart.data.purchasable && (
            <Alert tone="error" className="mt-4">
              Some items are no longer available as selected. <Link to="/cart" className="font-bold underline">Review your bag</Link>.
            </Alert>
          )}
          {placeError && (
            <Alert tone="error" className="mt-4">
              {placeError}
            </Alert>
          )}
          <Button size="lg" className="mt-6 w-full" disabled={!ready} loading={place.isPending || paying} onClick={placeOrder}>
            {payment === "RAZORPAY" ? `Pay ${formatINR(q?.totalPaise ?? 0)}` : "Place order"}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            By placing your order you agree to our{" "}
            <Link to="/policies/$slug" params={{ slug: "terms" }} className="underline">
              terms
            </Link>{" "}
            and{" "}
            <Link to="/policies/$slug" params={{ slug: "returns" }} className="underline">
              returns policy
            </Link>
            .
          </p>
        </aside>
      </div>
    </Container>
  );
}
