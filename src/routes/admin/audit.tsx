import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Pager, QueryState, Table, Td } from "@/components/admin/kit";
import { apiPage } from "@/lib/api";
import { fmtDateTime } from "@/lib/admin";

export const Route = createFileRoute("/admin/audit")({ component: Audit });

interface Row {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: { name: string; email: string } | null;
}

function Audit() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const q = useQuery({ queryKey: ["admin", "audit", page, entityType], queryFn: () => apiPage<Row>("/admin/audit-logs", { query: { page, pageSize: 50, entityType } }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Audit log" description="Significant admin and security actions: catalogue and stock changes, order status, refunds, coupons and password resets." />
      <div className="mb-4">
        <label htmlFor="audit-type" className="sr-only">Type</label>
        <select id="audit-type" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className="border bg-paper px-3 py-2 text-sm">
          <option value="">All types</option>
          {["Order", "Product", "ProductVariant", "Category", "Coupon", "ReturnRequest", "Review", "ShippingMethod", "User"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <QueryState query={q}>
        <Table head={["When", "Who", "Action", "Record", "Details"]} empty={!q.data?.data.length}>
          {q.data?.data.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(r.createdAt)}</Td>
              <Td>{r.actor ? <>{r.actor.name}<span className="block text-xs text-muted-foreground">{r.actor.email}</span></> : <span className="text-muted-foreground">System</span>}</Td>
              <Td className="font-mono text-xs">{r.action}</Td>
              <Td className="text-xs">{r.entityType}{r.entityId && <span className="block font-mono text-muted-foreground">{r.entityId}</span>}</Td>
              <Td className="max-w-sm break-words font-mono text-xs text-muted-foreground">{r.metadata ? JSON.stringify(r.metadata) : "—"}</Td>
            </tr>
          ))}
        </Table>
        {q.data && <Pager page={q.data.meta.page} totalPages={q.data.meta.totalPages} onPage={setPage} />}
      </QueryState>
    </>
  );
}
