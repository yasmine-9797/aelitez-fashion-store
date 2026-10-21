import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { formatINR } from "@shared/money";
import { Badge, Modal, PageHeader, QueryState, Table, Td } from "@/components/admin/kit";
import { Alert, Button, CheckboxField, TextField } from "@/components/shop/ui";
import { api, type ApiError } from "@/lib/api";
import { paiseToInput, rupeesInput, type ShippingMethodRow } from "@/lib/admin";

export const Route = createFileRoute("/admin/shipping")({ component: Shipping });

function Shipping() {
  const q = useQuery({ queryKey: ["admin", "shipping"], queryFn: () => api<ShippingMethodRow[]>("/admin/shipping-methods") });
  const [editing, setEditing] = useState<ShippingMethodRow | "new" | null>(null);
  return (
    <>
      <PageHeader title="Delivery options" description="Fees and delivery estimates shown on product pages and at checkout. Review these before launch." actions={<Button size="sm" onClick={() => setEditing("new")}>New option</Button>} />
      <QueryState query={q}>
        <Table head={["Name", "Fee", "Free above", "Estimate", "Cash on delivery", "Status", ""]} empty={!q.data?.length}>
          {q.data?.map((m) => (
            <tr key={m.id}>
              <Td><span className="font-semibold">{m.name}</span><span className="block text-xs text-muted-foreground">{m.code}</span></Td>
              <Td className="tabular-nums">{formatINR(m.feePaise)}</Td>
              <Td className="tabular-nums">{m.freeAbovePaise != null ? formatINR(m.freeAbovePaise) : "—"}</Td>
              <Td>{m.minDays}–{m.maxDays} days</Td>
              <Td>{m.codAllowed ? "Allowed" : "No"}</Td>
              <Td>{m.isActive ? <Badge className="border-ink bg-ink text-paper">Active</Badge> : <Badge className="border-muted-foreground text-muted-foreground">Off</Badge>}</Td>
              <Td><button type="button" onClick={() => setEditing(m)} className="font-bold underline">Edit</button></Td>
            </tr>
          ))}
        </Table>
      </QueryState>
      {editing && <MethodModal initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function MethodModal({ initial, onClose }: { initial: ShippingMethodRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    fee: paiseToInput(initial?.feePaise ?? 0),
    freeAbove: paiseToInput(initial?.freeAbovePaise),
    minDays: String(initial?.minDays ?? 3),
    maxDays: String(initial?.maxDays ?? 7),
    codAllowed: initial?.codAllowed ?? true,
    isActive: initial?.isActive ?? true,
    sortOrder: String(initial?.sortOrder ?? 0),
  });
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const save = useMutation({
    mutationFn: () => {
      const body = { code: f.code, name: f.name, description: f.description || null, feePaise: rupeesInput(f.fee) ?? 0, freeAbovePaise: rupeesInput(f.freeAbove), minDays: Number(f.minDays), maxDays: Number(f.maxDays), codAllowed: f.codAllowed, isActive: f.isActive, sortOrder: Number(f.sortOrder) || 0 };
      return initial ? api(`/admin/shipping-methods/${initial.id}`, { method: "PATCH", body }) : api("/admin/shipping-methods", { method: "POST", body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "shipping"] });
      void qc.invalidateQueries({ queryKey: ["shipping-methods"] });
      toast.success("Delivery option saved");
      onClose();
    },
  });
  const err = save.error as ApiError | null;
  return (
    <Modal open onClose={onClose} title={initial ? `Edit ${initial.name}` : "New delivery option"}>
      <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        {err && <Alert tone="error">{err.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={f.name} onChange={(e) => set({ name: e.target.value })} />
          <TextField label="Code" value={f.code} onChange={(e) => set({ code: e.target.value.toLowerCase() })} hint="Short id, e.g. standard" error={err?.field?.("code")} />
          <TextField label="Fee (₹)" inputMode="decimal" value={f.fee} onChange={(e) => set({ fee: e.target.value })} />
          <TextField label="Free above (₹)" optional inputMode="decimal" value={f.freeAbove} onChange={(e) => set({ freeAbove: e.target.value })} />
          <TextField label="Fastest (days)" inputMode="numeric" value={f.minDays} onChange={(e) => set({ minDays: e.target.value.replace(/\D/g, "") })} />
          <TextField label="Slowest (days)" inputMode="numeric" value={f.maxDays} onChange={(e) => set({ maxDays: e.target.value.replace(/\D/g, "") })} error={err?.field?.("maxDays")} />
        </div>
        <TextField label="Description" optional value={f.description} onChange={(e) => set({ description: e.target.value })} />
        <CheckboxField label="Allow cash on delivery with this option" checked={f.codAllowed} onChange={(e) => set({ codAllowed: e.target.checked })} />
        <CheckboxField label="Active" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
        <Button type="submit" loading={save.isPending}>Save</Button>
      </form>
    </Modal>
  );
}
