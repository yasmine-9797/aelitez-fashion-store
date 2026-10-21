import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { DEPARTMENT_LABEL } from "@shared/catalog";
import { formatINR } from "@shared/money";
import { Badge, PageHeader, Pager, QueryState, Table, Td, linkClass } from "@/components/admin/kit";
import { Button, ButtonLink } from "@/components/shop/ui";
import { apiPage } from "@/lib/api";
import { fmtDate, type AdminProductRow } from "@/lib/admin";

const searchSchema = z.object({
  q: z.string().max(80).optional().catch(undefined),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/admin/products/")({
  validateSearch: (s) => searchSchema.parse(s),
  component: ProductsPage,
});

const STATUS_CLASS = { ACTIVE: "border-ink bg-ink text-paper", DRAFT: "border-brand text-brand", ARCHIVED: "border-muted-foreground text-muted-foreground" } as const;

function ProductsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/products/" });
  const [q, setQ] = useState(search.q ?? "");
  const query = useQuery({ queryKey: ["admin", "products", search], queryFn: () => apiPage<AdminProductRow>("/admin/products", { query: { ...search, page: search.page ?? 1 } }), placeholderData: keepPreviousData });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void navigate({ search: { ...search, q: q.trim() || undefined, page: undefined } });
  };
  return (
    <>
      <PageHeader title="Products" description="New products start as drafts. Publish once they have photos, sizes and stock." actions={<ButtonLink to="/admin/products/new" size="sm">New product</ButtonLink>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="product-q" className="sr-only">Search products</label>
          <input id="product-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, slug or SKU" className="w-64 border bg-paper px-3 py-2 text-sm" />
          <Button type="submit" variant="dark" size="sm">Search</Button>
        </form>
        <label htmlFor="product-status" className="sr-only">Status</label>
        <select id="product-status" value={search.status ?? ""} onChange={(e) => void navigate({ search: { ...search, status: (e.target.value || undefined) as typeof search.status, page: undefined } })} className="border bg-paper px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="ACTIVE">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>
      <QueryState query={query}>
        <Table head={["", "Product", "Department", "Status", "Price", "Variants", "Stock", "Sold", "Updated"]} empty={!query.data?.data.length}>
          {query.data?.data.map((p) => (
            <tr key={p.id}>
              <Td>{p.image ? <img src={p.image} alt="" className="h-14 w-11 object-cover" /> : <div className="h-14 w-11 bg-muted" />}</Td>
              <Td>
                <Link to="/admin/products/$id" params={{ id: p.id }} className={linkClass}>{p.name}</Link>
                <span className="block text-xs text-muted-foreground">/{p.slug}</span>
              </Td>
              <Td>{DEPARTMENT_LABEL[p.department]}</Td>
              <Td><Badge className={STATUS_CLASS[p.status]}>{p.status === "ACTIVE" ? "Published" : p.status === "DRAFT" ? "Draft" : "Archived"}</Badge></Td>
              <Td className="tabular-nums">
                {formatINR(p.pricePaise)}
                {p.compareAtPaise && <s className="block text-xs text-muted-foreground">{formatINR(p.compareAtPaise)}</s>}
              </Td>
              <Td className="tabular-nums">{p.variantCount}</Td>
              <Td className="tabular-nums">{p.stockOnHand}</Td>
              <Td className="tabular-nums">{p.soldCount}</Td>
              <Td className="text-muted-foreground">{fmtDate(p.updatedAt)}</Td>
            </tr>
          ))}
        </Table>
        {query.data && <Pager page={query.data.meta.page} totalPages={query.data.meta.totalPages} onPage={(p) => void navigate({ search: { ...search, page: p } })} />}
      </QueryState>
    </>
  );
}
