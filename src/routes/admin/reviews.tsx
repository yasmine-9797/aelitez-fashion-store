import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, PageHeader, Pager, QueryState, Table, Td } from "@/components/admin/kit";
import { api, apiPage, isApiError } from "@/lib/api";
import { fmtDate } from "@/lib/admin";

export const Route = createFileRoute("/admin/reviews")({ component: Reviews });

interface Row {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  status: "PUBLISHED" | "HIDDEN";
  createdAt: string;
  product: { name: string; slug: string };
  user: { name: string; email: string };
}

function Reviews() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"" | "PUBLISHED" | "HIDDEN">("");
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["admin", "reviews", status, page], queryFn: () => apiPage<Row>("/admin/reviews", { query: { status, page } }), placeholderData: keepPreviousData });
  const moderate = useMutation({
    mutationFn: ({ id, next }: { id: string; next: Row["status"] }) => api(`/admin/reviews/${id}`, { method: "PATCH", body: { status: next } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "reviews"] });
      toast.success("Review updated");
    },
    onError: (e) => toast.error(isApiError(e) ? e.message : "Couldn't update"),
  });
  return (
    <>
      <PageHeader title="Reviews" description="Every review comes from a customer whose order was delivered. Hide reviews that break your guidelines — ratings recalculate automatically." />
      <div className="mb-4 flex gap-2">
        {(["", "PUBLISHED", "HIDDEN"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => { setStatus(s); setPage(1); }} className={`rounded-full border px-4 py-2 text-sm font-semibold ${status === s ? "border-ink bg-ink text-paper" : "bg-paper"}`}>
            {s ? s.charAt(0) + s.slice(1).toLowerCase() : "All"}
          </button>
        ))}
      </div>
      <QueryState query={q}>
        <Table head={["Product", "Rating", "Review", "Customer", "Date", ""]} empty={!q.data?.data.length}>
          {q.data?.data.map((r) => (
            <tr key={r.id} className={r.status === "HIDDEN" ? "opacity-60" : ""}>
              <Td><Link to="/products/$slug" params={{ slug: r.product.slug }} className="font-semibold hover:underline">{r.product.name}</Link></Td>
              <Td className="text-brand">{"★".repeat(r.rating)}</Td>
              <Td className="max-w-md">{r.title && <span className="block font-semibold">{r.title}</span>}{r.body}</Td>
              <Td>{r.user.name}<span className="block text-xs text-muted-foreground">{r.user.email}</span></Td>
              <Td className="text-muted-foreground">{fmtDate(r.createdAt)}</Td>
              <Td>
                {r.status === "HIDDEN" && <Badge className="mb-1 border-muted-foreground text-muted-foreground">Hidden</Badge>}
                <button type="button" onClick={() => moderate.mutate({ id: r.id, next: r.status === "PUBLISHED" ? "HIDDEN" : "PUBLISHED" })} className="block font-bold underline">
                  {r.status === "PUBLISHED" ? "Hide" : "Publish"}
                </button>
              </Td>
            </tr>
          ))}
        </Table>
        {q.data && <Pager page={q.data.meta.page} totalPages={q.data.meta.totalPages} onPage={setPage} />}
      </QueryState>
    </>
  );
}
