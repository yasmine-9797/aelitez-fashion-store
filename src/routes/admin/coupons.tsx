import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { formatINR } from "@shared/money";
import { Badge, Modal, PageHeader, QueryState, Table, Td } from "@/components/admin/kit";
import { Alert, Button, CheckboxField, SelectField, TextField } from "@/components/shop/ui";
import { api, type ApiError } from "@/lib/api";
import { fmtDate, paiseToInput, rupeesInput, type Coupon } from "@/lib/admin";

export const Route = createFileRoute("/admin/coupons")({ component: Coupons });

function Coupons() {
  const q = useQuery({ queryKey: ["admin", "coupons"], queryFn: () => api<Coupon[]>("/admin/coupons") });
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const now = Date.now();
  return (
    <>
      <PageHeader title="Coupons" description="Eligibility, limits and the discount are checked on the server at checkout." actions={<Button size="sm" onClick={() => setEditing("new")}>New coupon</Button>} />
      <QueryState query={q}>
        <Table head={["Code", "Discount", "Minimum", "Valid", "Used", "Status", ""]} empty={!q.data?.length}>
          {q.data?.map((c) => {
            const expired = c.endsAt && new Date(c.endsAt).getTime() <= now;
            return (
              <tr key={c.id}>
                <Td className="font-mono font-bold">{c.code}{c.description && <span className="block font-sans text-xs font-normal text-muted-foreground">{c.description}</span>}</Td>
                <Td>{c.type === "PERCENTAGE" ? `${c.value}%${c.maxDiscountPaise ? ` (max ${formatINR(c.maxDiscountPaise)})` : ""}` : formatINR(c.value)}</Td>
                <Td>{c.minSubtotalPaise ? formatINR(c.minSubtotalPaise) : "—"}</Td>
                <Td className="text-xs">{c.startsAt ? fmtDate(c.startsAt) : "Now"} → {c.endsAt ? fmtDate(c.endsAt) : "No end"}</Td>
                <Td className="tabular-nums">{c.timesUsed}{c.usageLimit ? ` / ${c.usageLimit}` : ""}{c.perCustomerLimit ? <span className="block text-xs text-muted-foreground">{c.perCustomerLimit} per customer</span> : null}</Td>
                <Td>{!c.isActive ? <Badge className="border-muted-foreground text-muted-foreground">Off</Badge> : expired ? <Badge className="border-muted-foreground text-muted-foreground">Expired</Badge> : <Badge className="border-ink bg-ink text-paper">Active</Badge>}</Td>
                <Td><button type="button" onClick={() => setEditing(c)} className="font-bold underline">Edit</button></Td>
              </tr>
            );
          })}
        </Table>
      </QueryState>
      {editing && <CouponModal initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

function CouponModal({ initial, onClose }: { initial: Coupon | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    code: initial?.code ?? "",
    description: initial?.description ?? "",
    type: initial?.type ?? ("PERCENTAGE" as Coupon["type"]),
    value: initial ? (initial.type === "PERCENTAGE" ? String(initial.value) : paiseToInput(initial.value)) : "",
    maxDiscount: paiseToInput(initial?.maxDiscountPaise),
    minSubtotal: paiseToInput(initial?.minSubtotalPaise || null),
    startsAt: toLocal(initial?.startsAt ?? null),
    endsAt: toLocal(initial?.endsAt ?? null),
    usageLimit: initial?.usageLimit?.toString() ?? "",
    perCustomerLimit: initial?.perCustomerLimit?.toString() ?? "",
    isActive: initial?.isActive ?? true,
  });
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: f.code,
        description: f.description || null,
        type: f.type,
        value: f.type === "PERCENTAGE" ? Number(f.value) : (rupeesInput(f.value) ?? 0),
        maxDiscountPaise: rupeesInput(f.maxDiscount),
        minSubtotalPaise: rupeesInput(f.minSubtotal) ?? 0,
        startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null,
        endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
        usageLimit: f.usageLimit ? Number(f.usageLimit) : null,
        perCustomerLimit: f.perCustomerLimit ? Number(f.perCustomerLimit) : null,
        isActive: f.isActive,
      };
      return initial ? api(`/admin/coupons/${initial.id}`, { method: "PATCH", body }) : api("/admin/coupons", { method: "POST", body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
      toast.success("Coupon saved");
      onClose();
    },
  });
  const err = save.error as ApiError | null;
  return (
    <Modal open onClose={onClose} title={initial ? `Edit ${initial.code}` : "New coupon"}>
      <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        {err && <Alert tone="error">{err.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Code" value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} error={err?.field?.("code")} />
          <TextField label="Description" optional value={f.description} onChange={(e) => set({ description: e.target.value })} />
          <SelectField label="Type" value={f.type} onChange={(e) => set({ type: e.target.value as Coupon["type"] })}>
            <option value="PERCENTAGE">Percentage off</option>
            <option value="FIXED">Fixed amount off</option>
          </SelectField>
          <TextField label={f.type === "PERCENTAGE" ? "Percent (1–100)" : "Amount (₹)"} inputMode="decimal" value={f.value} onChange={(e) => set({ value: e.target.value })} error={err?.field?.("value")} />
          {f.type === "PERCENTAGE" && <TextField label="Maximum discount (₹)" optional inputMode="decimal" value={f.maxDiscount} onChange={(e) => set({ maxDiscount: e.target.value })} />}
          <TextField label="Minimum order (₹)" optional inputMode="decimal" value={f.minSubtotal} onChange={(e) => set({ minSubtotal: e.target.value })} />
          <TextField label="Starts" optional type="datetime-local" value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
          <TextField label="Ends" optional type="datetime-local" value={f.endsAt} onChange={(e) => set({ endsAt: e.target.value })} error={err?.field?.("endsAt")} />
          <TextField label="Total uses allowed" optional inputMode="numeric" value={f.usageLimit} onChange={(e) => set({ usageLimit: e.target.value.replace(/\D/g, "") })} />
          <TextField label="Uses per customer" optional inputMode="numeric" value={f.perCustomerLimit} onChange={(e) => set({ perCustomerLimit: e.target.value.replace(/\D/g, "") })} />
        </div>
        <CheckboxField label="Active" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
        <Button type="submit" loading={save.isPending}>Save coupon</Button>
      </form>
    </Modal>
  );
}
