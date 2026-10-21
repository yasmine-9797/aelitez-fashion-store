import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SIZE_GROUPS, type SizeGroup } from "@shared/catalog";
import { Card, PageHeader, QueryState } from "@/components/admin/kit";
import { Button, SelectField, TextField } from "@/components/shop/ui";
import { api, isApiError } from "@/lib/api";
import type { AdminColor, AdminSize } from "@/lib/admin";

export const Route = createFileRoute("/admin/options")({ component: Options });

const GROUP_LABEL: Record<SizeGroup, string> = { BABY: "Baby", KIDS: "Kids", WOMEN: "Women", ONE_SIZE: "One size" };

function Options() {
  const qc = useQueryClient();
  const sizes = useQuery({ queryKey: ["admin", "sizes"], queryFn: () => api<AdminSize[]>("/admin/sizes") });
  const colors = useQuery({ queryKey: ["admin", "colors"], queryFn: () => api<AdminColor[]>("/admin/colors") });
  const onError = (e: unknown) => toast.error(isApiError(e) ? e.message : "Couldn't save");
  const [size, setSize] = useState({ label: "", group: "WOMEN" as SizeGroup, ageGuidance: "", sortOrder: "0" });
  const [color, setColor] = useState({ name: "", hex: "#000000" });
  const addSize = useMutation({
    mutationFn: () => api("/admin/sizes", { method: "POST", body: { label: size.label, group: size.group, ageGuidance: size.ageGuidance || null, sortOrder: Number(size.sortOrder) || 0 } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin", "sizes"] }); setSize({ ...size, label: "", ageGuidance: "" }); toast.success("Size added"); },
    onError,
  });
  const addColor = useMutation({
    mutationFn: () => api("/admin/colors", { method: "POST", body: color }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin", "colors"] }); setColor({ name: "", hex: "#000000" }); toast.success("Colour added"); },
    onError,
  });
  return (
    <>
      <PageHeader title="Sizes & colours" description="Size labels and the age guidance shown in size guides. Age guidance is optional and should come from your own size charts." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Sizes">
          <QueryState query={sizes}>
            {SIZE_GROUPS.map((g) => (
              <div key={g} className="mb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{GROUP_LABEL[g]}</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {(sizes.data ?? []).filter((s) => s.group === g).map((s) => (
                    <li key={s.id} className="border px-3 py-1 text-sm" title={s.ageGuidance ?? undefined}>
                      {s.label}{s.ageGuidance && <span className="text-xs text-muted-foreground"> · {s.ageGuidance}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </QueryState>
          <form className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); addSize.mutate(); }}>
            <TextField label="Label" value={size.label} onChange={(e) => setSize({ ...size, label: e.target.value })} placeholder="e.g. 4–5Y or M" />
            <SelectField label="Group" value={size.group} onChange={(e) => setSize({ ...size, group: e.target.value as SizeGroup })}>
              {SIZE_GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
            </SelectField>
            <TextField label="Age guidance" optional value={size.ageGuidance} onChange={(e) => setSize({ ...size, ageGuidance: e.target.value })} placeholder="e.g. 4–5 years" />
            <TextField label="Sort order" inputMode="numeric" value={size.sortOrder} onChange={(e) => setSize({ ...size, sortOrder: e.target.value.replace(/\D/g, "") })} />
            <div className="sm:col-span-2"><Button type="submit" size="sm" loading={addSize.isPending}>Add size</Button></div>
          </form>
        </Card>
        <Card title="Colours">
          <QueryState query={colors}>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {(colors.data ?? []).map((c) => (
                <li key={c.id} className="flex items-center gap-2"><span className="size-5 rounded-full border" style={{ backgroundColor: c.hex }} aria-hidden />{c.name}</li>
              ))}
            </ul>
          </QueryState>
          <form className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4" onSubmit={(e: FormEvent) => { e.preventDefault(); addColor.mutate(); }}>
            <div className="flex-1"><TextField label="Name" value={color.name} onChange={(e) => setColor({ ...color, name: e.target.value })} /></div>
            <label className="text-sm font-semibold">Swatch<input type="color" value={color.hex} onChange={(e) => setColor({ ...color, hex: e.target.value })} className="mt-1.5 block h-12 w-16 border" /></label>
            <Button type="submit" size="sm" loading={addColor.isPending}>Add colour</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
