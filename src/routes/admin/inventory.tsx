import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge, Modal, PageHeader, Pager, QueryState, Table, Td, linkClass } from "@/components/admin/kit";
import { Alert, Button, TextField } from "@/components/shop/ui";
import { api, apiPage, isApiError } from "@/lib/api";
import { fmtDateTime, type InventoryRow } from "@/lib/admin";

const searchSchema = z.object({
  q: z.string().max(80).optional().catch(undefined),
  filter: z.enum(["all", "low", "out"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/admin/inventory")({
  validateSearch: (s) => searchSchema.parse(s),
  component: Inventory,
});

interface Movement {
  id: string;
  type: string;
  onHandDelta: number;
  reservedDelta: number;
  reason: string | null;
  orderNumber: string | null;
  actor: string | null;
  createdAt: string;
}

function Inventory() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/inventory" });
  const [q, setQ] = useState(search.q ?? "");
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [history, setHistory] = useState<InventoryRow | null>(null);
  const query = useQuery({ queryKey: ["admin", "inventory", search], queryFn: () => apiPage<InventoryRow>("/admin/inventory", { query: { ...search, page: search.page ?? 1, pageSize: 50 } }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Inventory" description="Available = on hand − reserved for unpaid orders. Every change is recorded with a reason." />
      <div className="mb-4 flex flex-wrap gap-3">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void navigate({ search: { ...search, q: q.trim() || undefined, page: undefined } });
          }}
          className="flex gap-2"
        >
          <label htmlFor="inv-q" className="sr-only">Search</label>
          <input id="inv-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product or SKU" className="w-64 border bg-paper px-3 py-2 text-sm" />
          <Button type="submit" variant="dark" size="sm">Search</Button>
        </form>
        {(["all", "low", "out"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={(search.filter ?? "all") === f} onClick={() => void navigate({ search: { ...search, filter: f === "all" ? undefined : f, page: undefined } })} className={`rounded-full border px-4 py-2 text-sm font-semibold ${(search.filter ?? "all") === f ? "border-ink bg-ink text-paper" : "bg-paper"}`}>
            {f === "all" ? "All" : f === "low" ? "Low stock" : "Out of stock"}
          </button>
        ))}
      </div>
      <QueryState query={query}>
        <Table head={["Product", "SKU", "Size / colour", "On hand", "Reserved", "Available", "Alert at", ""]} empty={!query.data?.data.length}>
          {query.data?.data.map((r) => (
            <tr key={r.variantId} className={r.isActive ? "" : "opacity-50"}>
              <Td><Link to="/admin/products/$id" params={{ id: r.productId }} className={linkClass}>{r.productName}</Link></Td>
              <Td className="font-mono text-xs">{r.sku}</Td>
              <Td>{r.size} · {r.color}</Td>
              <Td className="tabular-nums">{r.onHand}</Td>
              <Td className="tabular-nums">{r.reserved}</Td>
              <Td className="tabular-nums">
                {r.available <= 0 ? <Badge className="border-brand bg-brand text-paper">0 — out</Badge> : r.available <= r.lowStockThreshold ? <Badge className="border-brand text-brand">{r.available} — low</Badge> : r.available}
              </Td>
              <Td className="tabular-nums">{r.lowStockThreshold}</Td>
              <Td className="whitespace-nowrap">
                <button type="button" onClick={() => setAdjusting(r)} className="mr-3 text-sm font-bold text-brand underline">Adjust</button>
                <button type="button" onClick={() => setHistory(r)} className="text-sm font-semibold underline">History</button>
              </Td>
            </tr>
          ))}
        </Table>
        {query.data && <Pager page={query.data.meta.page} totalPages={query.data.meta.totalPages} onPage={(p) => void navigate({ search: { ...search, page: p } })} />}
      </QueryState>
      {adjusting && <AdjustModal row={adjusting} onClose={() => setAdjusting(null)} />}
      {history && <HistoryModal row={history} onClose={() => setHistory(null)} />}
    </>
  );
}

function AdjustModal({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [threshold, setThreshold] = useState(String(row.lowStockThreshold));
  const adjust = useMutation({
    mutationFn: async () => {
      const d = Number(delta);
      if (delta && d !== 0) await api(`/admin/inventory/${row.variantId}/adjust`, { method: "POST", body: { delta: d, reason } });
      if (Number(threshold) !== row.lowStockThreshold) await api(`/admin/inventory/${row.variantId}`, { method: "PATCH", body: { lowStockThreshold: Number(threshold) } });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Stock updated");
      onClose();
    },
  });
  const next = row.onHand + (Number(delta) || 0);
  return (
    <Modal open onClose={onClose} title={`Adjust ${row.sku}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          adjust.mutate();
        }}
      >
        <p className="text-sm">{row.productName} · {row.size} · {row.color} — on hand <strong>{row.onHand}</strong>, reserved <strong>{row.reserved}</strong></p>
        {adjust.isError && <Alert tone="error">{isApiError(adjust.error) ? adjust.error.message : "Couldn't update stock"}</Alert>}
        <TextField label="Change (+ received, − removed)" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ""))} hint={delta ? `New on-hand: ${next}` : "e.g. 12 for a delivery, -1 for a damaged piece"} />
        <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} hint="Required for stock changes — e.g. “Supplier delivery #45” or “Damaged in store”." />
        <TextField label="Low-stock alert at" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))} />
        <Button type="submit" loading={adjust.isPending}>Save</Button>
      </form>
    </Modal>
  );
}

function HistoryModal({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const q = useQuery({ queryKey: ["admin", "movements", row.variantId], queryFn: () => api<Movement[]>(`/admin/inventory/${row.variantId}/movements`) });
  return (
    <Modal open onClose={onClose} title={`Stock history — ${row.sku}`}>
      <QueryState query={q}>
        <ul className="max-h-[60vh] divide-y overflow-y-auto text-sm">
          {q.data?.map((m) => (
            <li key={m.id} className="flex justify-between gap-4 py-3">
              <span>
                <span className="font-semibold">{m.type.replace(/_/g, " ").toLowerCase()}</span>
                {m.reason && <span className="text-muted-foreground"> · {m.reason}</span>}
                {m.orderNumber && <span className="text-muted-foreground"> · {m.orderNumber}</span>}
                <span className="block text-xs text-muted-foreground">{fmtDateTime(m.createdAt)}{m.actor ? ` · ${m.actor}` : ""}</span>
              </span>
              <span className="text-right tabular-nums">
                {m.onHandDelta !== 0 && <span className="block">{m.onHandDelta > 0 ? "+" : ""}{m.onHandDelta} on hand</span>}
                {m.reservedDelta !== 0 && <span className="block text-muted-foreground">{m.reservedDelta > 0 ? "+" : ""}{m.reservedDelta} reserved</span>}
              </span>
            </li>
          ))}
          {!q.data?.length && <li className="py-3 text-muted-foreground">No movements yet.</li>}
        </ul>
      </QueryState>
    </Modal>
  );
}
