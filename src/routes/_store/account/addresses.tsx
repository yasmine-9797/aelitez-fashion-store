import { createFileRoute } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AddressForm, AddressText } from "@/components/shop/AddressForm";
import { Alert, Button, EmptyState, Spinner } from "@/components/shop/ui";
import { isApiError } from "@/lib/api";
import { useAddresses, useDeleteAddress, useSaveAddress } from "@/lib/queries";

export const Route = createFileRoute("/_store/account/addresses")({ component: Addresses });

function Addresses() {
  const list = useAddresses();
  const save = useSaveAddress();
  const remove = useDeleteAddress();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  if (list.isLoading) return <Spinner label="Loading addresses" />;
  if (list.isError) return <Alert tone="error">{isApiError(list.error) ? list.error.message : "Couldn't load addresses."}</Alert>;
  const addresses = list.data ?? [];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Saved addresses</h2>
        {editing !== "new" && (
          <Button size="sm" onClick={() => setEditing("new")}>
            Add address
          </Button>
        )}
      </div>
      {editing === "new" && (
        <div className="border p-5">
          <AddressForm
            onSubmit={(values) => save.mutateAsync(values).then(() => { toast.success("Address saved"); setEditing(null); })}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
      {!addresses.length && editing !== "new" ? (
        <EmptyState icon={<MapPin className="size-12" />} title="No addresses yet" body="Save an address to check out faster." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="border p-5">
              {editing === a.id ? (
                <AddressForm initial={a} onSubmit={(values) => save.mutateAsync({ ...values, id: a.id }).then(() => { toast.success("Address updated"); setEditing(null); })} onCancel={() => setEditing(null)} />
              ) : (
                <>
                  {a.isDefault && <p className="eyebrow mb-2 text-brand">Default</p>}
                  <AddressText a={a} />
                  <div className="mt-4 flex gap-4 text-sm font-semibold">
                    <button type="button" onClick={() => setEditing(a.id)} className="underline hover:text-brand">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => window.confirm("Remove this address?") && remove.mutate(a.id, { onError: (e) => toast.error(isApiError(e) ? e.message : "Couldn't remove") })}
                      className="text-muted-foreground underline hover:text-brand"
                    >
                      Remove
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
