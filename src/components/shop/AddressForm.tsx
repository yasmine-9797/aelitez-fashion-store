import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { addressSchema, INDIAN_STATES, type AddressInput } from "@shared/validation";
import type { AddressDTO } from "@shared/types";
import { applyApiErrors } from "@/lib/forms";
import { Alert, Button, CheckboxField, SelectField, TextField } from "./ui";

const toInput = (a?: AddressDTO | null): AddressInput => ({
  fullName: a?.fullName ?? "",
  phone: a?.phone ?? "",
  line1: a?.line1 ?? "",
  line2: a?.line2 ?? "",
  landmark: a?.landmark ?? "",
  city: a?.city ?? "",
  state: (a?.state as AddressInput["state"]) ?? ("" as AddressInput["state"]),
  pincode: a?.pincode ?? "",
  isDefault: a?.isDefault ?? false,
});

/** Indian address form (state list, 10-digit mobile, 6-digit PIN) validated with the same schema as the API. */
export function AddressForm({
  initial,
  submitLabel = "Save address",
  onSubmit,
  onCancel,
  showDefault = true,
  extra,
}: {
  initial?: AddressDTO | null;
  submitLabel?: string;
  onSubmit: (values: AddressInput) => Promise<unknown>;
  onCancel?: () => void;
  showDefault?: boolean;
  extra?: React.ReactNode;
}) {
  const form = useForm<AddressInput>({ resolver: zodResolver(addressSchema), defaultValues: toInput(initial) });
  const [error, setError] = useState<string | null>(null);
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(applyApiErrors(err, form.setError, "address."));
    }
  });
  return (
    <form method="post" onSubmit={submit} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" autoComplete="name" {...form.register("fullName")} error={errors.fullName?.message} />
        <TextField label="Mobile number" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="10-digit mobile" {...form.register("phone")} error={errors.phone?.message} />
      </div>
      <TextField label="Flat, house no., building, street" autoComplete="address-line1" {...form.register("line1")} error={errors.line1?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Area / locality" optional autoComplete="address-line2" {...form.register("line2")} error={errors.line2?.message} />
        <TextField label="Landmark" optional {...form.register("landmark")} error={errors.landmark?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="City" autoComplete="address-level2" {...form.register("city")} error={errors.city?.message} />
        <SelectField label="State" autoComplete="address-level1" {...form.register("state")} error={errors.state?.message}>
          <option value="">Select state</option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <TextField label="PIN code" inputMode="numeric" autoComplete="postal-code" maxLength={6} {...form.register("pincode")} error={errors.pincode?.message} />
      </div>
      {showDefault && <CheckboxField label="Make this my default address" {...form.register("isDefault")} />}
      {extra}
      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function AddressText({ a }: { a: Pick<AddressDTO, "fullName" | "phone" | "line1" | "line2" | "landmark" | "city" | "state" | "pincode"> }) {
  return (
    <address className="text-sm not-italic leading-relaxed">
      <span className="font-semibold">{a.fullName}</span>
      <br />
      {a.line1}
      {a.line2 ? `, ${a.line2}` : ""}
      {a.landmark ? <><br />Near {a.landmark}</> : null}
      <br />
      {a.city}, {a.state} {a.pincode}
      <br />
      <span className="text-muted-foreground">+91 {a.phone}</span>
    </address>
  );
}
