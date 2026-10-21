import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { formatINR } from "@shared/money";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@shared/order-status";
import { Badge, OrderStatusBadge, PageHeader, Pager, PaymentBadge, QueryState, Table, Td, linkClass } from "@/components/admin/kit";
import { Button } from "@/components/shop/ui";
import { apiPage } from "@/lib/api";
import { fmtDateTime, type AdminOrderRow } from "@/lib/admin";

const searchSchema = z.object({
  q: z.string().max(80).optional().catch(undefined),
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  requiresRefund: z.enum(["1"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/admin/orders/")({
  validateSearch: (s) => searchSchema.parse(s),
  component: OrdersPage,
});

function OrdersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/orders/" });
  const [q, setQ] = useState(search.q ?? "");
  const page = search.page ?? 1;
  const query = useQuery({
    queryKey: ["admin", "orders", search],
    queryFn: () => apiPage<AdminOrderRow>("/admin/orders", { query: { ...search, page } }),
    placeholderData: keepPreviousData,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void navigate({ search: { ...search, q: q.trim() || undefined, page: undefined } });
  };
  return (
    <>
      <PageHeader title="Orders" description="Search by order number, email, phone or name." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="order-q" className="sr-only">Search orders</label>
          <input id="order-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="AEZ-…, email or phone" className="w-64 border bg-paper px-3 py-2 text-sm" />
          <Button type="submit" variant="dark" size="sm">Search</Button>
        </form>
        <label htmlFor="order-status" className="sr-only">Status</label>
        <select id="order-status" value={search.status ?? ""} onChange={(e) => void navigate({ search: { ...search, status: (e.target.value || undefined) as typeof search.status, page: undefined } })} className="border bg-paper px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={Boolean(search.requiresRefund)} onChange={(e) => void navigate({ search: { ...search, requiresRefund: e.target.checked ? "1" : undefined, page: undefined } })} className="size-4 accent-brand" />
          Refund needed
        </label>
      </div>
      <QueryState query={query}>
        <Table head={["Order", "Customer", "Status", "Payment", "Items", "Total", "Placed"]} empty={!query.data?.data.length}>
          {query.data?.data.map((o) => (
            <tr key={o.id}>
              <Td>
                <Link to="/admin/orders/$id" params={{ id: o.id }} className={linkClass}>{o.orderNumber}</Link>
                {o.requiresRefund && <Badge className="ml-2 border-brand text-brand">Refund needed</Badge>}
              </Td>
              <Td>
                {o.customer}
                <span className="block text-xs text-muted-foreground">{o.email}</span>
              </Td>
              <Td><OrderStatusBadge status={o.status} /></Td>
              <Td>
                <PaymentBadge status={o.paymentStatus} />
                <span className="mt-1 block text-xs text-muted-foreground">{PAYMENT_METHOD_LABEL[o.paymentMethod]}</span>
              </Td>
              <Td className="tabular-nums">{o.itemCount}</Td>
              <Td className="tabular-nums">{formatINR(o.totalPaise)}</Td>
              <Td className="text-muted-foreground">{fmtDateTime(o.createdAt)}</Td>
            </tr>
          ))}
        </Table>
        {query.data && <Pager page={query.data.meta.page} totalPages={query.data.meta.totalPages} onPage={(p) => void navigate({ search: { ...search, page: p } })} />}
      </QueryState>
    </>
  );
}
