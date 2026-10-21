import { Link, useNavigate } from "@tanstack/react-router";
import { ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@shared/money";
import type { CartItemDTO } from "@shared/types";
import { Overlay } from "@/components/shop/Overlay";
import { SmartImage } from "@/components/shop/SmartImage";
import { Alert, Button, ButtonLink, QtyStepper, Spinner } from "@/components/shop/ui";
import { isApiError } from "@/lib/api";
import { useCart, useConfig, useRemoveCartItem, useShippingMethods, useUpdateCartItem } from "@/lib/queries";

export const ISSUE_TEXT: Record<NonNullable<CartItemDTO["issue"]>, (i: CartItemDTO) => string> = {
  OUT_OF_STOCK: () => "This size is now sold out — remove it to continue.",
  QUANTITY_REDUCED: (i) => `Only ${i.available} left — reduce the quantity to continue.`,
  UNAVAILABLE: () => "This item is no longer available.",
};

export function CartLine({ item, compact = false }: { item: CartItemDTO; compact?: boolean }) {
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const config = useConfig();
  const max = Math.max(1, Math.min(item.available || item.quantity, config.data?.maxCartQuantity ?? 10));
  const onError = (e: unknown) => toast.error(isApiError(e) ? e.message : "Couldn't update your bag");
  return (
    <li className="flex gap-4 py-5">
      <Link to="/products/$slug" params={{ slug: item.productSlug }} className="shrink-0">
        {item.image ? (
          <SmartImage src={item.image.url} alt={item.image.alt} width={200} sizes="96px" className={compact ? "h-28 w-22 object-cover" : "h-36 w-28 object-cover"} />
        ) : (
          <div className={compact ? "h-28 w-22 bg-card" : "h-36 w-28 bg-card"} />
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to="/products/$slug" params={{ slug: item.productSlug }} className="font-semibold leading-snug hover:underline">
              {item.productName}
            </Link>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {item.color} · Size {item.size}
            </p>
            <p className="mt-0.5 text-sm">
              {formatINR(item.unitPricePaise)}
              {item.compareAtPaise && <s className="ml-2 text-muted-foreground">{formatINR(item.compareAtPaise)}</s>}
            </p>
          </div>
          <button
            type="button"
            aria-label={`Remove ${item.productName}`}
            disabled={remove.isPending}
            onClick={() => remove.mutate(item.id, { onSuccess: () => toast("Removed from bag", { description: item.productName }), onError })}
            className="p-1 text-muted-foreground hover:text-brand"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
        {item.issue && <p className="mt-2 text-xs font-semibold text-brand">{ISSUE_TEXT[item.issue](item)}</p>}
        <div className="mt-auto flex items-center justify-between pt-3">
          {item.issue === "UNAVAILABLE" || item.issue === "OUT_OF_STOCK" ? (
            <span />
          ) : (
            <QtyStepper value={item.quantity} max={Math.max(max, item.quantity)} label={item.productName} disabled={update.isPending} onChange={(q) => update.mutate({ id: item.id, quantity: q }, { onError })} />
          )}
          <p className="font-bold">{formatINR(item.lineTotalPaise)}</p>
        </div>
      </div>
    </li>
  );
}

/** Progress towards free delivery, using the store's configured delivery rules. */
export function FreeShippingNote({ subtotalPaise }: { subtotalPaise: number }) {
  const methods = useShippingMethods();
  const thresholds = (methods.data ?? []).map((m) => m.freeAbovePaise).filter((v): v is number => v != null);
  if (!thresholds.length || subtotalPaise <= 0) return null;
  const threshold = Math.min(...thresholds);
  const remaining = threshold - subtotalPaise;
  return (
    <div className="space-y-2">
      <p className="text-sm">{remaining > 0 ? <>Add <strong>{formatINR(remaining)}</strong> more for free standard delivery.</> : <strong>You've unlocked free standard delivery.</strong>}</p>
      <div className="h-1.5 bg-muted" aria-hidden>
        <div className="h-full bg-brand transition-all" style={{ width: `${Math.min(100, (subtotalPaise / threshold) * 100)}%` }} />
      </div>
    </div>
  );
}

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cart = useCart();
  const navigate = useNavigate();
  const data = cart.data;
  return (
    <Overlay open={open} onClose={onClose} label="Shopping bag" side="right" className="flex flex-col">
      <div className="border-b p-6 pr-16">
        <h2 className="display text-4xl">Your bag {data ? `(${data.itemCount})` : ""}</h2>
      </div>
      {cart.isLoading ? (
        <div className="p-6">
          <Spinner label="Loading your bag" />
        </div>
      ) : cart.isError ? (
        <div className="p-6">
          <Alert tone="error" title="We couldn't load your bag">
            {isApiError(cart.error) ? cart.error.message : "Please try again."}
          </Alert>
        </div>
      ) : !data?.items.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <ShoppingBag className="size-12 text-muted-foreground" aria-hidden />
          <p className="text-lg font-semibold">Your bag is empty</p>
          <ButtonLink to="/shop" onClick={onClose}>
            Start shopping
          </ButtonLink>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y overflow-y-auto px-6">
            {data.items.map((i) => (
              <CartLine key={i.id} item={i} compact />
            ))}
          </ul>
          <div className="space-y-4 border-t p-6">
            <FreeShippingNote subtotalPaise={data.subtotalPaise} />
            <div className="flex justify-between text-lg font-bold">
              <span>Subtotal</span>
              <span>{formatINR(data.subtotalPaise)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Prices include taxes. Delivery and offers are calculated at checkout.</p>
            <div className="grid grid-cols-2 gap-3">
              <ButtonLink to="/cart" variant="outline" onClick={onClose}>
                View bag
              </ButtonLink>
              <Button
                disabled={!data.purchasable}
                onClick={() => {
                  onClose();
                  void navigate({ to: "/checkout" });
                }}
              >
                Checkout
              </Button>
            </div>
          </div>
        </>
      )}
    </Overlay>
  );
}
