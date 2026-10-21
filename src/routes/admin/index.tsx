import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@shared/money";
import { Card, OrderStatusBadge, PageHeader, PaymentBadge, QueryState, Stat, Table, Td, linkClass } from "@/components/admin/kit";
import { api } from "@/lib/api";
import { fmtDateTime, type Dashboard } from "@/lib/admin";

export const Route = createFileRoute("/admin/")({ component: DashboardPage });

const compactINR = (paise: number) => {
  const r = paise / 100;
  return r >= 100_000 ? `₹${(r / 100_000).toFixed(1)}L` : r >= 1000 ? `₹${Math.round(r / 1000)}K` : `₹${Math.round(r)}`;
};

function DashboardPage() {
  const q = useQuery({ queryKey: ["admin", "dashboard"], queryFn: () => api<Dashboard>("/admin/dashboard"), refetchInterval: 60_000 });
  const d = q.data;
  return (
    <>
      <PageHeader title="Dashboard" description="Live figures from the store database. Revenue counts only payments confirmed by the payment gateway or cash recorded as collected." />
      <QueryState query={q}>
        {d && (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Verified revenue" value={formatINR(d.revenue.paidPaise)} hint={`${d.revenue.paidOrders} paid order${d.revenue.paidOrders === 1 ? "" : "s"}`} />
              <Stat label="Orders placed" value={d.orders.total} hint={`${d.orders.awaitingPayment} awaiting payment`} />
              <Stat label="To fulfil" value={d.orders.toFulfil} hint="Confirmed, processing or packed" />
              <Stat label="Products live" value={d.products.ACTIVE ?? 0} hint={`${d.products.DRAFT ?? 0} draft · ${d.products.ARCHIVED ?? 0} archived`} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Link to="/admin/inventory" search={{ filter: "low" }} className="block">
                <Stat label="Low stock" value={d.stock.lowStockVariants} hint="Variants at or below their threshold" tone={d.stock.lowStockVariants ? "alert" : undefined} />
              </Link>
              <Link to="/admin/inventory" search={{ filter: "out" }} className="block">
                <Stat label="Out of stock" value={d.stock.outOfStockVariants} hint="Active variants with nothing to sell" tone={d.stock.outOfStockVariants ? "alert" : undefined} />
              </Link>
              <Link to="/admin/orders" search={{ requiresRefund: "1" }} className="block">
                <Stat label="Refunds needed" value={d.orders.requiresRefund} hint="Paid orders that were cancelled or returned" tone={d.orders.requiresRefund ? "alert" : undefined} />
              </Link>
              <Link to="/admin/returns" className="block">
                <Stat label="Open returns" value={d.orders.openReturns} hint="Requested, approved or received" tone={d.orders.openReturns ? "alert" : undefined} />
              </Link>
            </div>
            <SalesTrend data={d.salesTrend} />
            <Card title="Recent orders" actions={<Link to="/admin/orders" className="text-sm font-bold text-brand underline">All orders</Link>}>
              <Table head={["Order", "Customer", "Status", "Payment", "Total", "Placed"]} empty={!d.recentOrders.length}>
                {d.recentOrders.map((o) => (
                  <tr key={o.id}>
                    <Td>
                      <Link to="/admin/orders/$id" params={{ id: o.id }} className={linkClass}>
                        {o.orderNumber}
                      </Link>
                    </Td>
                    <Td>{o.customer}</Td>
                    <Td><OrderStatusBadge status={o.status} /></Td>
                    <Td><PaymentBadge status={o.paymentStatus} /></Td>
                    <Td className="tabular-nums">{formatINR(o.totalPaise)}</Td>
                    <Td className="text-muted-foreground">{fmtDateTime(o.createdAt)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        )}
      </QueryState>
    </>
  );
}

/** Daily verified revenue for the last 30 days. Shown only once real paid orders exist. */
function SalesTrend({ data }: { data: Dashboard["salesTrend"] }) {
  const [showTable, setShowTable] = useState(false);
  if (!data.length) {
    return (
      <Card title="Sales — last 30 days">
        <p className="text-sm text-muted-foreground">No verified sales yet. The trend appears here once orders are paid.</p>
      </Card>
    );
  }
  const rows = data.map((d) => ({ ...d, label: new Date(`${d.day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) }));
  return (
    <Card
      title="Verified revenue per day — last 30 days"
      actions={
        <button type="button" onClick={() => setShowTable(!showTable)} className="text-sm font-bold underline">
          {showTable ? "Show chart" : "Show table"}
        </button>
      }
    >
      {showTable ? (
        <Table head={["Day", "Revenue", "Paid orders"]}>
          {rows.map((r) => (
            <tr key={r.day}>
              <Td>{r.label}</Td>
              <Td className="tabular-nums">{formatINR(r.revenuePaise)}</Td>
              <Td className="tabular-nums">{r.orders}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <div className="h-64" role="img" aria-label={`Bar chart of daily verified revenue over ${rows.length} days. Use "Show table" for exact values.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="#e7e7e7" strokeWidth={1} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#d4d4d4" }} tick={{ fontSize: 11, fill: "#5c5c5c" }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tickFormatter={compactINR} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5c5c5c" }} width={56} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(20,20,20,0.05)" }}
                content={({ active, payload }) => {
                  const p = active && payload?.[0] ? (payload[0].payload as (typeof rows)[number]) : null;
                  return p ? (
                    <div className="border bg-paper px-3 py-2 text-xs shadow-lg">
                      <p className="font-bold">{p.label}</p>
                      <p className="tabular-nums">{formatINR(p.revenuePaise)} · {p.orders} order{p.orders === 1 ? "" : "s"}</p>
                    </div>
                  ) : null;
                }}
              />
              <Bar dataKey="revenuePaise" fill="#e11d24" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
