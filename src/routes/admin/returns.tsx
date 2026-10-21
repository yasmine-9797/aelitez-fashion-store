import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { formatINR } from "@shared/money";
import { Badge, PageHeader, Pager, QueryState, Table, Td, linkClass } from "@/components/admin/kit";
import { apiPage } from "@/lib/api";
import { fmtDateTime, type ReturnRow } from "@/lib/admin";

export const Route = createFileRoute("/admin/returns")({ component: Returns });

type Row = ReturnRow & { order: { orderNumber: string; totalPaise: number; paymentMethod: string; paymentStatus: string }; user: { name: string; email: string } };
const STATUSES = ["", "REQUESTED", "APPROVED", "RECEIVED", "REFUNDED", "REJECTED"] as const;

function Returns() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("REQUESTED");
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["admin", "returns", status, page], queryFn: () => apiPage<Row>("/admin/returns", { query: { status, page } }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Returns" description="Approve, receive and refund returns from each order's page." />
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => { setStatus(s); setPage(1); }} className={`rounded-full border px-4 py-2 text-sm font-semibold ${status === s ? "border-ink bg-ink text-paper" : "bg-paper"}`}>
            {s ? s.charAt(0) + s.slice(1).toLowerCase() : "All"}
          </button>
        ))}
      </div>
      <QueryState query={q}>
        <Table head={["Order", "Customer", "Reason", "Status", "Order total", "Requested"]} empty={!q.data?.data.length}>
          {q.data?.data.map((r) => (
            <tr key={r.id}>
              <Td><Link to="/admin/orders/$id" params={{ id: r.orderId }} className={linkClass}>{r.order.orderNumber}</Link></Td>
              <Td>{r.user.name}<span className="block text-xs text-muted-foreground">{r.user.email}</span></Td>
              <Td>{r.reason}{r.details && <span className="block text-xs text-muted-foreground">{r.details}</span>}</Td>
              <Td><Badge className={r.status === "REQUESTED" ? "border-brand text-brand" : ""}>{r.status}</Badge></Td>
              <Td className="tabular-nums">{formatINR(r.order.totalPaise)} <span className="text-xs text-muted-foreground">· {r.order.paymentMethod}</span></Td>
              <Td className="text-muted-foreground">{fmtDateTime(r.createdAt)}</Td>
            </tr>
          ))}
        </Table>
        {q.data && <Pager page={q.data.meta.page} totalPages={q.data.meta.totalPages} onPage={setPage} />}
      </QueryState>
    </>
  );
}
