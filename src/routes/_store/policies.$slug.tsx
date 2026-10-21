import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { formatINR } from "@shared/money";
import { Alert, Container } from "@/components/shop/ui";
import { BRAND, external } from "@/lib/brand";
import { useConfig, useShippingMethods } from "@/lib/queries";
import { pageHead } from "@/lib/seo";

const POLICIES = {
  shipping: "Shipping & delivery",
  returns: "Returns & exchanges",
  privacy: "Privacy policy",
  terms: "Terms of service",
} as const;
type Slug = keyof typeof POLICIES;

export const Route = createFileRoute("/_store/policies/$slug")({
  loader: ({ params }) => {
    if (!(params.slug in POLICIES)) throw notFound();
    return { slug: params.slug as Slug };
  },
  head: ({ params }) => (params.slug in POLICIES ? pageHead({ title: POLICIES[params.slug as Slug], description: `${POLICIES[params.slug as Slug]} for ${BRAND.name}.`, path: `/policies/${params.slug}` }) : {}),
  component: Policy,
});

function Policy() {
  const { slug } = Route.useLoaderData();
  return (
    <Container className="max-w-3xl py-12 md:py-16">
      <p className="eyebrow text-brand">Help</p>
      <h1 className="display mt-3 text-5xl md:text-7xl">{POLICIES[slug]}</h1>
      <Alert tone="info" className="mt-8" title="Full policy coming soon">
        AELITEZ CLOTHINGS is finalising the wording of this policy. Below is what the online store does today. For anything else, message us on{" "}
        <a href={BRAND.instagramUrl} {...external} className="font-bold underline">
          Instagram
        </a>
        .
      </Alert>
      <div className="prose-sm mt-8 space-y-4 leading-relaxed">{CONTENT[slug]()}</div>
    </Container>
  );
}

function Shipping() {
  const methods = useShippingMethods();
  return (
    <>
      <p>We deliver across India using courier partners. Delivery options and charges are shown at checkout before you pay:</p>
      <ul className="list-disc space-y-1 pl-5">
        {(methods.data ?? []).map((m) => (
          <li key={m.code}>
            <strong>{m.name}</strong>: {m.feePaise === 0 ? "free" : formatINR(m.feePaise)}
            {m.freeAbovePaise != null ? `, free on orders above ${formatINR(m.freeAbovePaise)}` : ""} — usually {m.minDays}–{m.maxDays} business days.
          </li>
        ))}
      </ul>
      <p>Once your order ships, the courier and tracking number appear on your order page in your account.</p>
    </>
  );
}

function Returns() {
  const config = useConfig();
  return (
    <>
      <p>You can request a return from the order page in your account within {config.data?.returnWindowDays ?? "the stated number of"} days of delivery.</p>
      <p>After we receive and check the items, the refund is sent to your original payment method. For cash-on-delivery orders, we arrange a bank transfer or UPI refund and share the reference with you.</p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <p>When you create an account or place an order we store your name, email, mobile number, delivery addresses and order history so we can deliver your orders and show your order status.</p>
      <p>Card, UPI and bank details are entered on Razorpay's secure payment window and are never sent to or stored by AELITEZ.</p>
      <p>We use essential cookies only: to keep you signed in, remember your shopping bag, and protect forms from misuse. Your recently viewed products are remembered in your own browser.</p>
      <p>Marketing emails are sent only if you opt in, and you can unsubscribe at any time.</p>
    </>
  );
}

function Terms() {
  return (
    <>
      <p>Prices are shown in Indian rupees and include taxes. The amount charged is the total confirmed at checkout.</p>
      <p>An order is confirmed once payment is verified by our payment partner, or immediately for cash-on-delivery orders where offered. Unpaid online orders are cancelled automatically after a short reservation period.</p>
    </>
  );
}

const CONTENT: Record<Slug, () => ReactNode> = { shipping: Shipping, returns: Returns, privacy: Privacy, terms: Terms };
