import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DEPARTMENTS, DEPARTMENT_LABEL, type Department } from "@shared/catalog";
import { discountPercent } from "@shared/money";
import { Alert, Button, CheckboxField, SelectField, TextAreaField, TextField } from "@/components/shop/ui";
import { api, isApiError, type ApiError } from "@/lib/api";
import { paiseToInput, rupeesInput, type AdminCategory, type AdminProduct } from "@/lib/admin";

export interface ProductFormValues {
  name: string;
  slug?: string;
  description: string;
  fabric: string | null;
  care: string | null;
  specs: { label: string; value: string }[];
  department: Department;
  categoryIds: string[];
  pricePaise: number;
  compareAtPaise: number | null;
  ageMinMonths: number | null;
  ageMaxMonths: number | null;
  isFeatured: boolean;
}

export function useAdminCategories() {
  return useQuery({ queryKey: ["admin", "categories"], queryFn: () => api<AdminCategory[]>("/admin/categories") });
}

export function ProductForm({ initial, submitLabel, onSubmit }: { initial?: AdminProduct; submitLabel: string; onSubmit: (v: ProductFormValues) => Promise<unknown> }) {
  const categories = useAdminCategories();
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [fabric, setFabric] = useState(initial?.fabric ?? "");
  const [care, setCare] = useState(initial?.care ?? "");
  const [specs, setSpecs] = useState<{ label: string; value: string }[]>(initial?.specs ?? []);
  const [department, setDepartment] = useState<Department>(initial?.department ?? "WOMEN");
  const [categoryIds, setCategoryIds] = useState<string[]>(initial?.categories.map((c) => c.category.id) ?? []);
  const [price, setPrice] = useState(paiseToInput(initial?.pricePaise));
  const [compareAt, setCompareAt] = useState(paiseToInput(initial?.compareAtPaise));
  const [ageMin, setAgeMin] = useState(initial?.ageMinMonths?.toString() ?? "");
  const [ageMax, setAgeMax] = useState(initial?.ageMaxMonths?.toString() ?? "");
  const [featured, setFeatured] = useState(initial?.isFeatured ?? false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const deptCats = (categories.data ?? []).filter((c) => c.department === department);
  const pricePaise = rupeesInput(price);
  const comparePaise = rupeesInput(compareAt);
  const off = pricePaise != null ? discountPercent(pricePaise, comparePaise) : 0;
  const fe = (path: string) => error?.field(path);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        name,
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        description,
        fabric: fabric || null,
        care: care || null,
        specs: specs.filter((s) => s.label.trim() && s.value.trim()),
        department,
        categoryIds: categoryIds.filter((id) => deptCats.some((c) => c.id === id)),
        pricePaise: pricePaise ?? 0,
        compareAtPaise: comparePaise,
        ageMinMonths: ageMin ? Number(ageMin) : null,
        ageMaxMonths: ageMax ? Number(ageMax) : null,
        isFeatured: featured,
      });
    } catch (err) {
      setError(isApiError(err) ? err : null);
      if (!isApiError(err)) throw err;
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error && <Alert tone="error">{error.message}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Product name" value={name} onChange={(e) => setName(e.target.value)} error={fe("name")} required />
        <TextField label="URL slug" optional value={slug} onChange={(e) => setSlug(e.target.value)} error={fe("slug")} hint="Leave blank to generate from the name." />
      </div>
      <TextAreaField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} error={fe("description")} rows={5} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Fabric" optional value={fabric} onChange={(e) => setFabric(e.target.value)} error={fe("fabric")} />
        <TextField label="Care instructions" optional value={care} onChange={(e) => setCare(e.target.value)} error={fe("care")} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SelectField label="Department" value={department} onChange={(e) => setDepartment(e.target.value as Department)} hint="AELITEZ sells kids' and women's fashion only.">
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABEL[d]}
            </option>
          ))}
        </SelectField>
        <TextField label="Selling price (₹)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={fe("pricePaise")} />
        <TextField label="Original price (₹)" optional inputMode="decimal" value={compareAt} onChange={(e) => setCompareAt(e.target.value)} error={fe("compareAtPaise")} hint={off > 0 ? `Shows as ${off}% off` : "Only if the product is genuinely on offer."} />
      </div>

      {department === "KIDS" && (
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Age guidance from (months)" optional inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(e.target.value.replace(/\D/g, ""))} error={fe("ageMinMonths")} hint="e.g. 24 for 2 years. Used for shop-by-age." />
          <TextField label="Age guidance to (months)" optional inputMode="numeric" value={ageMax} onChange={(e) => setAgeMax(e.target.value.replace(/\D/g, ""))} error={fe("ageMaxMonths")} />
        </div>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Categories</legend>
        {deptCats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {DEPARTMENT_LABEL[department].toLowerCase()} categories yet — add them under Categories.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {deptCats.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={categoryIds.includes(c.id)} onChange={(e) => setCategoryIds(e.target.checked ? [...categoryIds, c.id] : categoryIds.filter((x) => x !== c.id))} className="size-4 accent-brand" />
                {c.parentId ? <span className="text-muted-foreground">{deptCats.find((p) => p.id === c.parentId)?.name} ›</span> : null} {c.name}
              </label>
            ))}
          </div>
        )}
        {fe("categoryIds") && <p className="mt-1 text-xs font-semibold text-brand">{fe("categoryIds")}</p>}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Specifications</legend>
        <div className="space-y-2">
          {specs.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label="Specification name" value={s.label} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="e.g. Fit" className="w-40 border px-3 py-2 text-sm" />
              <input aria-label="Specification value" value={s.value} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="e.g. Relaxed" className="flex-1 border px-3 py-2 text-sm" />
              <button type="button" aria-label="Remove specification" onClick={() => setSpecs(specs.filter((_, j) => j !== i))} className="px-2 text-muted-foreground hover:text-brand">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setSpecs([...specs, { label: "", value: "" }])} className="inline-flex items-center gap-1 text-sm font-bold text-brand">
            <Plus className="size-4" /> Add specification
          </button>
        </div>
      </fieldset>

      <CheckboxField label="Feature this product" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
      <Button type="submit" loading={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
