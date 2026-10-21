import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/admin/kit";
import { ProductForm } from "@/components/admin/ProductForm";
import { api } from "@/lib/api";
import type { AdminProduct } from "@/lib/admin";

export const Route = createFileRoute("/admin/products/new")({ component: NewProduct });

function NewProduct() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <>
      <PageHeader title="New product" description="Save the details first — then add photos, sizes and stock, and publish." actions={<Link to="/admin/products" className="text-sm font-bold underline">← Products</Link>} />
      <Card className="max-w-4xl">
        <ProductForm
          submitLabel="Create draft"
          onSubmit={async (values) => {
            const p = await api<AdminProduct>("/admin/products", { method: "POST", body: values });
            void qc.invalidateQueries({ queryKey: ["admin", "products"] });
            toast.success("Draft created", { description: "Now add photos and sizes." });
            await navigate({ to: "/admin/products/$id", params: { id: p.id } });
          }}
        />
      </Card>
    </>
  );
}
