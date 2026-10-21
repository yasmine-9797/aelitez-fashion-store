import { createFileRoute, Link } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { z } from "zod";
import { formatINR } from "@shared/money";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@shared/order-status";
import { Alert, ButtonLink, EmptyState, Spinner } from "@/components/shop/ui";
import { isApiError } from "@/lib/api";
import { useOrders } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_store/account/orders/")({
  validateSearch: (s) => z.object({ page: z.coerce.number().int().min(1).max(500).optional().catch(undefined) }).parse(s),
  component: Orders,
});

export const statusTone = (status: string) =>
  status === "CANCELLED" || status === "PENDING_PAYMENT" ? "text-brand" : status === "DELIVERED" || status === "REFUNDED" ? "text-ink" : "text-ink";

function Orders() {
  const { page = 1 } = Route.useSearch();
  const orders = useOrders(page);
  if (orders.isLoading) return <Spinner label="Loading your orders" />;
  if (orders.isError) return <Alert tone="error">{isApiError(orders.error) ? orders.error.message : "Couldn't load your orders."}</Alert>;
  const list = orders.data?.data ?? [];
  if (!list.length) return <EmptyState icon={<Package className="size-12" />} title="No orders yet" body="When you place an order, you'll be able to track it here." action={<ButtonLink to="/shop">Start shopping</ButtonLink>} />;
  const meta = orders.data!.meta;
  return (
    <div>
      <h2 className="text-xl font-bold">Your orders</h2>
      <ul className="mt-5 divide-y border-y">
        {list.map((o) => (
          <li key={o.id}>
            <Link to="/account/orders/$id" params={{ id: o.id }} className="flex flex-wrap items-center justify-between gap-4 py-5 hover:bg-muted/50">
              <div>
                <p className="font-bold">{o.orderNumber}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="text-right">
                <p className={cn("text-sm font-bold", statusTone(o.status))}>{ORDER_STATUS_LABEL[o.status]}</p>
                <p className="text-sm text-muted-foreground">
                  {formatINR(o.totalPaise)} · {PAYMENT_STATUS_LABEL[o.paymentStatus]}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {meta.totalPages > 1 && (
        <div className="mt-6 flex gap-3">
          <ButtonLink to="/account/orders" search={{ page: page > 2 ? page - 1 : undefined }} variant="outline" size="sm" disabled={page <= 1} aria-disabled={page <= 1}>
            Newer
          </ButtonLink>
          <ButtonLink to="/account/orders" search={{ page: page + 1 }} variant="outline" size="sm" disabled={page >= meta.totalPages} aria-disabled={page >= meta.totalPages}>
            Older
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
