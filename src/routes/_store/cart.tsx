import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { formatINR } from "@shared/money";
import { CartLine, FreeShippingNote } from "@/components/layout/CartDrawer";
import { Alert, ButtonLink, Container, EmptyState, Spinner } from "@/components/shop/ui";
import { isApiError } from "@/lib/api";
import { useCart } from "@/lib/queries";
import { privateHead } from "@/lib/seo";

export const Route = createFileRoute("/_store/cart")({
  head: () => privateHead("Your bag"),
  component: CartPage,
});

function CartPage() {
  const cart = useCart();
  const data = cart.data;
  return (
    <Container className="py-12 md:py-16">
      <h1 className="display text-6xl md:text-8xl">Your bag</h1>
      {cart.isLoading ? (
        <Spinner className="mt-8" label="Loading your bag" />
      ) : cart.isError ? (
        <Alert tone="error" className="mt-8" title="We couldn't load your bag">
          {isApiError(cart.error) ? cart.error.message : "Please try again."}
        </Alert>
      ) : !data?.items.length ? (
        <EmptyState icon={<ShoppingBag className="size-12" />} title="Your bag is empty" body="Find something you love in the new arrivals." action={<ButtonLink to="/shop" search={{ sort: "newest" }}>Shop new arrivals</ButtonLink>} />
      ) : (
        <div className="mt-10 grid gap-12 lg:grid-cols-12">
          <ul className="divide-y border-y lg:col-span-8">
            {data.items.map((i) => (
              <CartLine key={i.id} item={i} />
            ))}
          </ul>
          <aside className="h-fit space-y-5 bg-card p-6 lg:col-span-4 lg:sticky lg:top-28" aria-label="Order summary">
            <h2 className="text-lg font-bold">Summary</h2>
            <FreeShippingNote subtotalPaise={data.subtotalPaise} />
            <div className="flex justify-between">
              <span>Subtotal ({data.itemCount} item{data.itemCount === 1 ? "" : "s"})</span>
              <span className="font-bold">{formatINR(data.subtotalPaise)}</span>
            </div>
            <p className="text-sm text-muted-foreground">Delivery charges and coupon savings are worked out at checkout. Prices include taxes.</p>
            {!data.purchasable && <Alert tone="error">Some items need your attention before you can check out.</Alert>}
            <ButtonLink to="/checkout" size="lg" className="w-full" disabled={!data.purchasable} aria-disabled={!data.purchasable}>
              Proceed to checkout
            </ButtonLink>
            <ButtonLink to="/shop" variant="outline" className="w-full">
              Continue shopping
            </ButtonLink>
          </aside>
        </div>
      )}
    </Container>
  );
}
