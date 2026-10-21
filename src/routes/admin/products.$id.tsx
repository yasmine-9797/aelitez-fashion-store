import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ExternalLink, Trash2, Upload } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { formatINR } from "@shared/money";
import type { SizeGroup } from "@shared/catalog";
import { Badge, Card, PageHeader, QueryState, Table, Td } from "@/components/admin/kit";
import { ProductForm } from "@/components/admin/ProductForm";
import { Alert, Button, SelectField, TextField } from "@/components/shop/ui";
import { api, isApiError } from "@/lib/api";
import { paiseToInput, rupeesInput, type AdminColor, type AdminProduct, type AdminSize } from "@/lib/admin";

export const Route = createFileRoute("/admin/products/$id")({ component: EditProduct });

const GROUPS_FOR: Record<"KIDS" | "WOMEN", SizeGroup[]> = { KIDS: ["BABY", "KIDS", "ONE_SIZE"], WOMEN: ["WOMEN", "ONE_SIZE"] };

function EditProduct() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const key = ["admin", "product", id];
  const query = useQuery({ queryKey: key, queryFn: () => api<AdminProduct>(`/admin/products/${id}`) });
  const set = (p: AdminProduct) => {
    qc.setQueryData(key, p);
    void qc.invalidateQueries({ queryKey: ["admin", "products"] });
  };
  const status = useMutation({
    mutationFn: (s: "DRAFT" | "ACTIVE" | "ARCHIVED") => api<AdminProduct>(`/admin/products/${id}/status`, { method: "POST", body: { status: s } }),
    onSuccess: (p) => {
      set(p);
      toast.success(p.status === "ACTIVE" ? "Published — it's live in the store" : p.status === "DRAFT" ? "Unpublished" : "Archived");
    },
    onError: (e) => toast.error(isApiError(e) ? e.message : "Couldn't change status"),
  });

  return (
    <QueryState query={query}>
      {query.data && (() => {
        const p = query.data;
        return (
          <>
            <PageHeader
              title={p.name}
              description={<>/{p.slug} · {p.variants.length} variant{p.variants.length === 1 ? "" : "s"} · {p.soldCount} sold</>}
              actions={
                <>
                  <Link to="/admin/products" className="self-center text-sm font-bold underline">← Products</Link>
                  {p.status === "ACTIVE" && (
                    <a href={`/products/${p.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-center text-sm font-bold text-brand underline">
                      View in store <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </>
              }
            />
            <div className="grid gap-6 xl:grid-cols-3">
              <div className="space-y-6 xl:col-span-2">
                <Card title="Details">
                  <ProductForm
                    initial={p}
                    submitLabel="Save details"
                    onSubmit={async (values) => {
                      set(await api<AdminProduct>(`/admin/products/${id}`, { method: "PATCH", body: values }));
                      toast.success("Saved");
                    }}
                  />
                </Card>
                <Variants product={p} onChange={set} />
              </div>
              <div className="space-y-6">
                <Card title="Visibility">
                  <p className="mb-4 text-sm">
                    Status: <Badge className={p.status === "ACTIVE" ? "border-ink bg-ink text-paper" : "border-brand text-brand"}>{p.status === "ACTIVE" ? "Published" : p.status === "DRAFT" ? "Draft" : "Archived"}</Badge>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {p.status !== "ACTIVE" && <Button size="sm" loading={status.isPending} onClick={() => status.mutate("ACTIVE")}>Publish</Button>}
                    {p.status === "ACTIVE" && <Button size="sm" variant="outline" loading={status.isPending} onClick={() => status.mutate("DRAFT")}>Unpublish</Button>}
                    {p.status !== "ARCHIVED" && <Button size="sm" variant="ghost" loading={status.isPending} onClick={() => window.confirm("Archive this product? It disappears from the store but order history is kept.") && status.mutate("ARCHIVED")}>Archive</Button>}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Publishing needs at least one photo, one active size and one category.</p>
                </Card>
                <Images product={p} onChange={set} />
              </div>
            </div>
          </>
        );
      })()}
    </QueryState>
  );
}

function Images({ product: p, onChange }: { product: AdminProduct; onChange: (p: AdminProduct) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const colors = [...new Map(p.variants.map((v) => [v.color.id, v.color])).values()];
  const call = async (fn: () => Promise<AdminProduct>, ok?: string) => {
    setBusy(true);
    try {
      onChange(await fn());
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Image action failed");
    } finally {
      setBusy(false);
    }
  };
  const upload = (e: FormEvent) => {
    e.preventDefault();
    const files = fileRef.current?.files;
    if (!files?.length) {
      toast.error("Choose one or more images first");
      return;
    }
    const form = new FormData();
    for (const f of Array.from(files)) form.append("images", f);
    if (alt.trim()) form.append("alt", alt.trim());
    void call(() => api<AdminProduct>(`/admin/products/${p.id}/images`, { method: "POST", form }), "Images uploaded").then(() => {
      if (fileRef.current) fileRef.current.value = "";
      setAlt("");
    });
  };
  const move = (imageId: string, dir: -1 | 1) => {
    const list = [...p.images].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = list.findIndex((x) => x.id === imageId);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j]!, next[i]!];
    // Renumber 0..n so the order is always unambiguous.
    void call(async () => {
      let latest = p;
      for (const [k, img] of next.entries()) {
        if (img.sortOrder !== k) latest = await api<AdminProduct>(`/admin/products/${p.id}/images/${img.id}`, { method: "PATCH", body: { sortOrder: k } });
      }
      return latest;
    });
  };
  return (
    <Card title="Photos">
      <ul className="grid grid-cols-2 gap-3">
        {[...p.images].sort((a, b) => a.sortOrder - b.sortOrder).map((img, i) => (
          <li key={img.id} className="border p-2">
            <img src={img.url} alt={img.alt} className="aspect-[4/5] w-full object-cover" />
            {i === 0 && <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-brand">Main image</p>}
            <input
              aria-label="Image description (alt text)"
              defaultValue={img.alt}
              onBlur={(e) => e.target.value.trim() && e.target.value !== img.alt && void call(() => api<AdminProduct>(`/admin/products/${p.id}/images/${img.id}`, { method: "PATCH", body: { alt: e.target.value.trim() } }), "Description saved")}
              className="mt-2 w-full border px-2 py-1 text-xs"
            />
            {colors.length > 1 && (
              <select aria-label="Colour shown" value={img.colorId ?? ""} onChange={(e) => void call(() => api<AdminProduct>(`/admin/products/${p.id}/images/${img.id}`, { method: "PATCH", body: { colorId: e.target.value || null } }))} className="mt-1 w-full border px-2 py-1 text-xs">
                <option value="">Any colour</option>
                {colors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <div className="mt-1 flex justify-between">
              <span className="flex gap-1">
                <button type="button" aria-label="Move earlier" disabled={busy || i === 0} onClick={() => move(img.id, -1)} className="p-1 disabled:opacity-30"><ArrowUp className="size-4" /></button>
                <button type="button" aria-label="Move later" disabled={busy || i === p.images.length - 1} onClick={() => move(img.id, 1)} className="p-1 disabled:opacity-30"><ArrowDown className="size-4" /></button>
              </span>
              <button type="button" aria-label="Delete image" disabled={busy} onClick={() => window.confirm("Delete this image?") && void call(() => api<AdminProduct>(`/admin/products/${p.id}/images/${img.id}`, { method: "DELETE" }), "Image deleted")} className="p-1 text-muted-foreground hover:text-brand"><Trash2 className="size-4" /></button>
            </div>
          </li>
        ))}
      </ul>
      {!p.images.length && <p className="text-sm text-muted-foreground">No photos yet.</p>}
      <form onSubmit={upload} className="mt-4 space-y-3 border-t pt-4">
        <label className="block text-sm font-semibold" htmlFor="image-files">Upload photos</label>
        <input id="image-files" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="block w-full text-sm" />
        <TextField label="Description for screen readers" optional value={alt} onChange={(e) => setAlt(e.target.value)} hint="e.g. “Girl in a pink ruffle party frock”. Defaults to the product name." />
        <p className="text-xs text-muted-foreground">JPEG, PNG, WebP or AVIF, at least 400×400px. Images are checked, stripped of metadata and converted to WebP.</p>
        <Button type="submit" size="sm" loading={busy}><Upload className="size-4" /> Upload</Button>
      </form>
    </Card>
  );
}

function Variants({ product: p, onChange }: { product: AdminProduct; onChange: (p: AdminProduct) => void }) {
  const sizes = useQuery({ queryKey: ["admin", "sizes"], queryFn: () => api<AdminSize[]>("/admin/sizes") });
  const colors = useQuery({ queryKey: ["admin", "colors"], queryFn: () => api<AdminColor[]>("/admin/colors") });
  const [colorId, setColorId] = useState("");
  const [sizeIds, setSizeIds] = useState<string[]>([]);
  const [prefix, setPrefix] = useState(p.slug.split("-").map((w) => w[0]).join("").toUpperCase().slice(0, 6));
  const [stock, setStock] = useState("0");
  const [threshold, setThreshold] = useState("3");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const allowed = (sizes.data ?? []).filter((s) => GROUPS_FOR[p.department].includes(s.group));
  const color = colors.data?.find((c) => c.id === colorId);
  const existing = new Set(p.variants.map((v) => `${v.size.id}:${v.color.id}`));
  const skuFor = (s: AdminSize) => `${prefix}-${(color?.name ?? "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()}-${s.label.replace(/[^A-Za-z0-9]/g, "")}`;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!color || !sizeIds.length) {
      toast.error("Choose a colour and at least one size");
      return;
    }
    setBusy(true);
    setErrors([]);
    const failed: string[] = [];
    let latest: AdminProduct | null = null;
    for (const sId of sizeIds) {
      const s = allowed.find((x) => x.id === sId)!;
      try {
        latest = await api<AdminProduct>(`/admin/products/${p.id}/variants`, {
          method: "POST",
          body: { sizeId: sId, colorId: color.id, sku: skuFor(s), initialStock: Number(stock) || 0, lowStockThreshold: Number(threshold) || 0, ...(rupeesInput(price) != null ? { pricePaise: rupeesInput(price) } : {}) },
        });
      } catch (err) {
        failed.push(`${s.label}: ${isApiError(err) ? err.message : "failed"}`);
      }
    }
    if (latest) onChange(latest);
    setErrors(failed);
    if (!failed.length) {
      toast.success(`${sizeIds.length} variant${sizeIds.length === 1 ? "" : "s"} added`);
      setSizeIds([]);
    }
    setBusy(false);
  };

  const toggleActive = async (variantId: string, isActive: boolean) => {
    try {
      onChange(await api<AdminProduct>(`/admin/variants/${variantId}`, { method: "PATCH", body: { isActive } }));
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Couldn't update");
    }
  };

  return (
    <Card title="Sizes, colours & stock" actions={<Link to="/admin/inventory" search={{ q: p.name }} className="text-sm font-bold text-brand underline">Adjust stock</Link>}>
      <Table head={["SKU", "Size", "Colour", "Price", "On hand", "Reserved", "Status"]} empty={!p.variants.length}>
        {p.variants.map((v) => (
          <tr key={v.id} className={v.isActive ? "" : "opacity-50"}>
            <Td className="font-mono text-xs">{v.sku}</Td>
            <Td>{v.size.label}</Td>
            <Td><span className="inline-flex items-center gap-2"><span className="size-3 rounded-full border" style={{ backgroundColor: v.color.hex }} />{v.color.name}</span></Td>
            <Td className="tabular-nums">{formatINR(v.pricePaise ?? p.pricePaise)}{v.pricePaise != null && <span className="block text-xs text-muted-foreground">override</span>}</Td>
            <Td className={`tabular-nums ${v.inventory && v.inventory.onHand - v.inventory.reserved <= v.inventory.lowStockThreshold ? "font-bold text-brand" : ""}`}>{v.inventory?.onHand ?? 0}</Td>
            <Td className="tabular-nums">{v.inventory?.reserved ?? 0}</Td>
            <Td>
              <button type="button" onClick={() => void toggleActive(v.id, !v.isActive)} className="text-xs font-bold underline">
                {v.isActive ? "Active — disable" : "Disabled — enable"}
              </button>
            </Td>
          </tr>
        ))}
      </Table>

      <form onSubmit={add} className="mt-6 space-y-4 border-t pt-5">
        <p className="text-sm font-bold">Add sizes in one colour</p>
        {errors.length > 0 && <Alert tone="error">{errors.join(" · ")}</Alert>}
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField label="Colour" value={colorId} onChange={(e) => setColorId(e.target.value)}>
            <option value="">Choose colour</option>
            {(colors.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectField>
          <TextField label="SKU prefix" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} hint={color && allowed[0] ? `e.g. ${skuFor(allowed[0])}` : "SKU = prefix-colour-size"} />
          <TextField label="Price override (₹)" optional inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} hint={`Default ${formatINR(p.pricePaise)}`} />
          <TextField label="Starting stock (each size)" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))} />
          <TextField label="Low-stock alert at" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))} />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Sizes</legend>
          <div className="flex flex-wrap gap-2">
            {allowed.map((s) => {
              const taken = Boolean(color && existing.has(`${s.id}:${color.id}`));
              const on = sizeIds.includes(s.id);
              return (
                <button key={s.id} type="button" disabled={taken} aria-pressed={on} onClick={() => setSizeIds(on ? sizeIds.filter((x) => x !== s.id) : [...sizeIds, s.id])} className={`min-w-12 border px-3 py-1.5 text-sm font-semibold ${on ? "border-ink bg-ink text-paper" : "hover:border-ink"} ${taken ? "cursor-not-allowed opacity-30" : ""}`}>
                  {s.label}
                </button>
              );
            })}
          </div>
          {!allowed.length && <p className="text-sm text-muted-foreground">No sizes for this department yet — add them under Sizes &amp; colours.</p>}
        </fieldset>
        <Button type="submit" size="sm" loading={busy}>Add {sizeIds.length || ""} variant{sizeIds.length === 1 ? "" : "s"}</Button>
        <p className="text-xs text-muted-foreground">Prices are {paiseToInput(p.pricePaise) ? `₹${paiseToInput(p.pricePaise)}` : "the product price"} unless overridden.</p>
      </form>
    </Card>
  );
}
