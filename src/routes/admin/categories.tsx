import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DEPARTMENTS, DEPARTMENT_LABEL, type Department } from "@shared/catalog";
import { Badge, Card, Modal, PageHeader, QueryState } from "@/components/admin/kit";
import { useAdminCategories } from "@/components/admin/ProductForm";
import { Alert, Button, CheckboxField, SelectField, TextAreaField, TextField } from "@/components/shop/ui";
import { api, isApiError, type ApiError } from "@/lib/api";
import type { AdminCategory } from "@/lib/admin";

export const Route = createFileRoute("/admin/categories")({ component: Categories });

function Categories() {
  const cats = useAdminCategories();
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      toast.success("Category deleted");
    },
    onError: (e) => toast.error(isApiError(e) ? e.message : "Couldn't delete"),
  });
  return (
    <>
      <PageHeader
        title="Categories"
        description="Kids' and women's categories only — men's categories are blocked. Empty categories are hidden from shoppers automatically."
        actions={<Button size="sm" onClick={() => setEditing("new")}>New category</Button>}
      />
      <QueryState query={cats}>
        <div className="grid gap-6 lg:grid-cols-2">
          {DEPARTMENTS.map((d) => {
            const list = (cats.data ?? []).filter((c) => c.department === d);
            const roots = list.filter((c) => !c.parentId);
            return (
              <Card key={d} title={DEPARTMENT_LABEL[d]}>
                <ul className="divide-y text-sm">
                  {roots.map((c) => (
                    <li key={c.id} className="py-2">
                      <Row c={c} onEdit={() => setEditing(c)} onDelete={() => window.confirm(`Delete “${c.name}”?`) && remove.mutate(c.id)} />
                      {list.filter((ch) => ch.parentId === c.id).map((ch) => (
                        <div key={ch.id} className="ml-6 border-l pl-3 pt-2">
                          <Row c={ch} onEdit={() => setEditing(ch)} onDelete={() => window.confirm(`Delete “${ch.name}”?`) && remove.mutate(ch.id)} />
                        </div>
                      ))}
                    </li>
                  ))}
                  {!roots.length && <li className="py-2 text-muted-foreground">No categories yet.</li>}
                </ul>
              </Card>
            );
          })}
        </div>
      </QueryState>
      {editing && <CategoryModal initial={editing === "new" ? null : editing} all={cats.data ?? []} onClose={() => setEditing(null)} />}
    </>
  );
}

function Row({ c, onEdit, onDelete }: { c: AdminCategory; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>
        <span className="font-semibold">{c.name}</span> <span className="text-xs text-muted-foreground">/{c.slug} · {c._count.products} product{c._count.products === 1 ? "" : "s"}</span>
        {c.isFeatured && <Badge className="ml-2 border-brand text-brand">Trending</Badge>}
        {!c.isActive && <Badge className="ml-2 border-muted-foreground text-muted-foreground">Hidden</Badge>}
      </span>
      <span className="flex shrink-0 gap-3">
        <button type="button" onClick={onEdit} className="font-bold underline">Edit</button>
        {c._count.products === 0 && c._count.children === 0 && <button type="button" onClick={onDelete} className="text-muted-foreground underline hover:text-brand">Delete</button>}
      </span>
    </div>
  );
}

function CategoryModal({ initial, all, onClose }: { initial: AdminCategory | null; all: AdminCategory[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [department, setDepartment] = useState<Department>(initial?.department ?? "KIDS");
  const [parentId, setParentId] = useState(initial?.parentId ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isFeatured, setFeatured] = useState(initial?.isFeatured ?? false);
  const [isActive, setActive] = useState(initial?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const save = useMutation({
    mutationFn: () => {
      const body = { name, ...(slug ? { slug } : {}), department, parentId: parentId || null, description: description || null, isFeatured, isActive, sortOrder: Number(sortOrder) || 0 };
      return initial ? api(`/admin/categories/${initial.id}`, { method: "PATCH", body }) : api("/admin/categories", { method: "POST", body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      toast.success(initial ? "Category updated" : "Category created");
      onClose();
    },
  });
  const err = save.error as ApiError | null;
  const parents = all.filter((c) => c.department === department && !c.parentId && c.id !== initial?.id);
  return (
    <Modal open onClose={onClose} title={initial ? `Edit ${initial.name}` : "New category"}>
      <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        {err && <Alert tone="error">{err.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={err?.field?.("name")} />
          <TextField label="URL slug" optional value={slug} onChange={(e) => setSlug(e.target.value)} error={err?.field?.("slug")} hint="Leave blank to generate." />
          <SelectField label="Department" value={department} onChange={(e) => { setDepartment(e.target.value as Department); setParentId(""); }}>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{DEPARTMENT_LABEL[d]}</option>)}
          </SelectField>
          <SelectField label="Parent" optional value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Top level —</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>
        </div>
        <TextAreaField label="Description" optional value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <TextField label="Sort order" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/\D/g, ""))} />
        <CheckboxField label="Show as a trending collection on the homepage" checked={isFeatured} onChange={(e) => setFeatured(e.target.checked)} />
        <CheckboxField label="Visible in the store" checked={isActive} onChange={(e) => setActive(e.target.checked)} />
        <Button type="submit" loading={save.isPending}>Save</Button>
      </form>
    </Modal>
  );
}
