import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { formatINR } from "@shared/money";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, type OrderStatus } from "@shared/order-status";
import { Badge, Card, OrderStatusBadge, PageHeader, PaymentBadge, QueryState, Table, Td } from "@/components/admin/kit";
import { AddressText } from "@/components/shop/AddressForm";
import { Alert, Button, TextField } from "@/components/shop/ui";
import { api, isApiError } from "@/lib/api";
import { can, fmtDateTime, type AdminOrder } from "@/lib/admin";
import { useMe } from "@/lib/queries";

export const Route = createFileRoute("/admin/orders/$id")({ component: OrderAdmin });

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  PROCESSING: "Start processing",
  PACKED: "Mark packed",
  SHIPPED: "Mark shipped",
  DELIVERED: "Mark delivered",
};

function OrderAdmin() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const me = useMe();
  const key = ["admin", "order", id];
  const query = useQuery({ queryKey: key, queryFn: () => api<AdminOrder>(`/admin/orders/${id}`) });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api<AdminOrder>(`/admin/orders/${id}${path}`, { method: "POST", body: body ?? {} }),
    onSuccess: (o) => {
      qc.setQueryData(key, o);
      void qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      toast.success("Order updated");
    },
    onError: (e) => toast.error(isApiError(e) ? e.message : "Action failed"),
  });
  const returnAct = useMutation({
    mutationFn: ({ returnId, action, note }: { returnId: string; action: "approve" | "reject" | "receive"; note?: string }) => api(`/admin/returns/${returnId}/${action}`, { method: "POST", body: { note } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success("Return updated");
    },
    onError: (e) => toast.error(isApiError(e) ? e.message : "Action failed"),
  });
  const [shipment, setShipment] = useState({ carrier: "", trackingNumber: "", trackingUrl: "" });
  const [cancelReason, setCancelReason] = useState("");
  const [refundRef, setRefundRef] = useState("");

  return (
    <QueryState query={query}>
      {query.data && (() => {
        const o = query.data;
        const openReturn = o.returnRequests.find((r) => r.status === "REQUESTED" || r.status === "APPROVED");
        const canRefund = can(me.data?.role, "refunds") && o.paymentStatus === "PAID" && (o.status === "CANCELLED" || o.status === "RETURNED");
        const submitShipment = (e: FormEvent) => {
          e.preventDefault();
          act.mutate({ path: "/shipment", body: { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber || undefined, trackingUrl: shipment.trackingUrl || undefined } });
        };
        return (
          <>
            <PageHeader
              title={o.orderNumber}
              description={<>Placed {fmtDateTime(o.createdAt)} by <strong>{o.customer.name}</strong> ({o.customer.email})</>}
              actions={<Link to="/admin/orders" className="text-sm font-bold underline">← All orders</Link>}
            />
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <OrderStatusBadge status={o.status} />
              <PaymentBadge status={o.paymentStatus} />
              <Badge className="border-muted-foreground">{PAYMENT_METHOD_LABEL[o.paymentMethod]}</Badge>
              {o.requiresRefund && <Badge className="border-brand bg-brand text-paper">Refund needed</Badge>}
            </div>
            <div className="grid gap-6 xl:grid-cols-3">
              <div className="space-y-6 xl:col-span-2">
                <Card title="Items">
                  <Table head={["Product", "SKU", "Size / colour", "Qty", "Price", "Total"]}>
                    {o.items.map((i) => (
                      <tr key={i.id}>
                        <Td>{i.productName}</Td>
                        <Td className="font-mono text-xs">{i.sku}</Td>
                        <Td>{i.size} · {i.color}</Td>
                        <Td className="tabular-nums">{i.quantity}</Td>
                        <Td className="tabular-nums">{formatINR(i.unitPricePaise)}</Td>
                        <Td className="tabular-nums">{formatINR(i.lineTotalPaise)}</Td>
                      </tr>
                    ))}
                  </Table>
                  <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
                    <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(o.subtotalPaise)}</dd></div>
                    {o.discountPaise > 0 && <div className="flex justify-between"><dt>Discount ({o.couponCode})</dt><dd>−{formatINR(o.discountPaise)}</dd></div>}
                    <div className="flex justify-between"><dt>{o.shippingMethod.name}</dt><dd>{formatINR(o.shippingPaise)}</dd></div>
                    <div className="flex justify-between border-t pt-1 font-bold"><dt>Total</dt><dd>{formatINR(o.totalPaise)}</dd></div>
                  </dl>
                </Card>

                <Card title="Fulfilment">
                  {o.allowedStatuses.length === 0 && !["PACKED", "SHIPPED"].includes(o.status) ? (
                    <p className="text-sm text-muted-foreground">
                      No manual status changes from “{ORDER_STATUS_LABEL[o.status]}”.
                      {o.status === "PENDING_PAYMENT" && " The order confirms automatically once the payment gateway verifies payment."}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {o.allowedStatuses.filter((s) => s !== "CANCELLED").map((s) => (
                        <Button key={s} size="sm" variant="dark" loading={act.isPending} onClick={() => act.mutate({ path: "/status", body: { status: s } })}>
                          {ACTION_LABEL[s] ?? ORDER_STATUS_LABEL[s]}
                        </Button>
                      ))}
                    </div>
                  )}
                  {(o.status === "PACKED" || o.status === "SHIPPED") && (
                    <form onSubmit={submitShipment} className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-3">
                      <TextField label="Courier" value={shipment.carrier} onChange={(e) => setShipment({ ...shipment, carrier: e.target.value })} placeholder={o.shipment?.carrier ?? "e.g. Delhivery"} required />
                      <TextField label="Tracking number" optional value={shipment.trackingNumber} onChange={(e) => setShipment({ ...shipment, trackingNumber: e.target.value })} placeholder={o.shipment?.trackingNumber ?? ""} />
                      <TextField label="Tracking link" optional type="url" value={shipment.trackingUrl} onChange={(e) => setShipment({ ...shipment, trackingUrl: e.target.value })} placeholder="https://…" />
                      <div className="sm:col-span-3">
                        <Button type="submit" size="sm" loading={act.isPending}>{o.status === "PACKED" ? "Save & mark shipped" : "Update shipment"}</Button>
                      </div>
                    </form>
                  )}
                  {o.shipment && (
                    <p className="mt-4 text-sm">
                      Shipped with <strong>{o.shipment.carrier}</strong>{o.shipment.trackingNumber && <> · {o.shipment.trackingNumber}</>}
                      {o.shipment.shippedAt && <> · {fmtDateTime(o.shipment.shippedAt)}</>}
                    </p>
                  )}
                  {o.paymentMethod === "COD" && o.paymentStatus !== "PAID" && (o.status === "SHIPPED" || o.status === "DELIVERED") && (
                    <div className="mt-5 border-t pt-5">
                      <Button size="sm" variant="outline" loading={act.isPending} onClick={() => window.confirm(`Confirm ${formatINR(o.totalPaise)} cash was collected?`) && act.mutate({ path: "/cod-collected" })}>
                        Record cash collected ({formatINR(o.totalPaise)})
                      </Button>
                    </div>
                  )}
                  {o.allowedStatuses.includes("CANCELLED") && (
                    <form
                      className="mt-5 flex flex-wrap items-end gap-3 border-t pt-5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (window.confirm("Cancel this order? Stock is returned automatically.")) act.mutate({ path: "/status", body: { status: "CANCELLED", note: cancelReason || undefined } });
                      }}
                    >
                      <div className="min-w-64 flex-1">
                        <TextField label="Cancellation reason" optional value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                      </div>
                      <Button type="submit" size="sm" variant="outline">Cancel order</Button>
                    </form>
                  )}
                </Card>

                {o.returnRequests.length > 0 && (
                  <Card title="Returns">
                    <ul className="space-y-3 text-sm">
                      {o.returnRequests.map((r) => (
                        <li key={r.id} className="border p-4">
                          <p className="font-semibold">{r.reason} · <Badge>{r.status}</Badge></p>
                          {r.details && <p className="mt-1 text-muted-foreground">{r.details}</p>}
                          {r.adminNote && <p className="mt-1">Note: {r.adminNote}</p>}
                          <p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(r.createdAt)}</p>
                        </li>
                      ))}
                    </ul>
                    {openReturn && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {openReturn.status === "REQUESTED" && <Button size="sm" variant="dark" onClick={() => returnAct.mutate({ returnId: openReturn.id, action: "approve" })}>Approve return</Button>}
                        {openReturn.status === "APPROVED" && <Button size="sm" variant="dark" onClick={() => window.confirm("Mark the parcel received? Items go back into stock.") && returnAct.mutate({ returnId: openReturn.id, action: "receive" })}>Mark received & restock</Button>}
                        <Button size="sm" variant="outline" onClick={() => { const note = window.prompt("Reason for declining (shown in the order history):") ?? undefined; returnAct.mutate({ returnId: openReturn.id, action: "reject", ...(note ? { note } : {}) }); }}>Decline</Button>
                      </div>
                    )}
                  </Card>
                )}

                <Card title="Payments & refunds">
                  {o.payments.length === 0 ? <p className="text-sm text-muted-foreground">No payment records.</p> : (
                    <Table head={["Provider", "Status", "Amount", "Reference", "Captured"]}>
                      {o.payments.map((p) => (
                        <tr key={p.id}>
                          <Td>{p.provider}{p.method ? ` · ${p.method}` : ""}</Td>
                          <Td>{p.status}{p.errorDescription && <span className="block text-xs text-brand">{p.errorDescription}</span>}</Td>
                          <Td className="tabular-nums">{formatINR(p.amountPaise)}</Td>
                          <Td className="font-mono text-xs">{p.providerPaymentId ?? "—"}</Td>
                          <Td>{p.capturedAt ? fmtDateTime(p.capturedAt) : "—"}</Td>
                        </tr>
                      ))}
                    </Table>
                  )}
                  {o.refunds.length > 0 && (
                    <ul className="mt-4 space-y-1 text-sm">
                      {o.refunds.map((r) => (
                        <li key={r.id}>Refund {formatINR(r.amountPaise)} · {r.status} · {r.providerRefundId ?? r.manualReference} · {fmtDateTime(r.createdAt)}</li>
                      ))}
                    </ul>
                  )}
                  {canRefund && (
                    <form
                      className="mt-5 flex flex-wrap items-end gap-3 border-t pt-5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (window.confirm(`Refund ${formatINR(o.totalPaise)}?`)) act.mutate({ path: "/refund", body: o.paymentMethod === "COD" ? { manualReference: refundRef } : {} });
                      }}
                    >
                      {o.paymentMethod === "COD" ? (
                        <div className="min-w-64 flex-1">
                          <TextField label="Bank transfer / UPI reference" value={refundRef} onChange={(e) => setRefundRef(e.target.value)} required hint="Cash-on-delivery refunds are paid outside the system — record the reference here." />
                        </div>
                      ) : (
                        <p className="flex-1 text-sm text-muted-foreground">The full amount is refunded to the customer's original payment method through Razorpay.</p>
                      )}
                      <Button type="submit" size="sm">Refund {formatINR(o.totalPaise)}</Button>
                    </form>
                  )}
                </Card>
              </div>

              <div className="space-y-6">
                <Card title="Ship to">
                  <AddressText a={o.shippingAddress} />
                  <p className="mt-3 text-sm text-muted-foreground">{o.shippingMethod.name} · {o.shippingMethod.minDays}–{o.shippingMethod.maxDays} days</p>
                </Card>
                <Card title="Contact">
                  <p className="text-sm">{o.email}<br />+91 {o.phone}</p>
                </Card>
                <Card title="History">
                  <ol className="space-y-3 text-sm">
                    {o.events.map((e, i) => (
                      <li key={i} className="border-l-2 border-brand pl-3">
                        <p className="font-semibold">{ORDER_STATUS_LABEL[e.status]}</p>
                        {e.note && <p className="text-muted-foreground">{e.note}</p>}
                        <p className="text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</p>
                      </li>
                    ))}
                  </ol>
                </Card>
                {o.requiresRefund && !can(me.data?.role, "refunds") && <Alert tone="error">This paid order needs a refund — ask an administrator to issue it.</Alert>}
              </div>
            </div>
          </>
        );
      })()}
    </QueryState>
  );
}
