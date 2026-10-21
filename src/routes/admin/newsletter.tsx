import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Pager, QueryState, Table, Td } from "@/components/admin/kit";
import { apiPage } from "@/lib/api";
import { fmtDateTime } from "@/lib/admin";

export const Route = createFileRoute("/admin/newsletter")({ component: Newsletter });

function Newsletter() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["admin", "newsletter", page], queryFn: () => apiPage<{ id: string; email: string; source: string | null; consentAt: string }>("/admin/newsletter", { query: { page, pageSize: 50 } }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Newsletter" description={`Subscribers who gave consent${q.data ? ` · ${q.data.meta.total} total` : ""}. Unsubscribed addresses are excluded.`} />
      <QueryState query={q}>
        <Table head={["Email", "Signed up from", "Consent given"]} empty={!q.data?.data.length}>
          {q.data?.data.map((s) => (
            <tr key={s.id}>
              <Td>{s.email}</Td>
              <Td>{s.source ?? "—"}</Td>
              <Td className="text-muted-foreground">{fmtDateTime(s.consentAt)}</Td>
            </tr>
          ))}
        </Table>
        {q.data && <Pager page={q.data.meta.page} totalPages={q.data.meta.totalPages} onPage={setPage} />}
      </QueryState>
    </>
  );
}
