import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { passwordSchema } from "@shared/validation";
import { Alert, Button, TextField } from "@/components/shop/ui";
import { api } from "@/lib/api";
import { applyApiErrors } from "@/lib/forms";

export const Route = createFileRoute("/_store/account/security")({ component: Security });

const schema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password"), newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { message: "Passwords don't match", path: ["confirm"] });

function Security() {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { currentPassword: "", newPassword: "", confirm: "" } });
  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    setError(null);
    try {
      await api("/account/change-password", { method: "POST", body: { currentPassword, newPassword } });
      toast.success("Password changed", { description: "You've been signed out on other devices." });
      form.reset();
    } catch (err) {
      setError(applyApiErrors(err, form.setError));
    }
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <div className="max-w-md">
      <h2 className="text-xl font-bold">Change password</h2>
      <form method="post" onSubmit={onSubmit} className="mt-5 space-y-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="Current password" type="password" autoComplete="current-password" {...form.register("currentPassword")} error={errors.currentPassword?.message} />
        <TextField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters, with a letter and a number." {...form.register("newPassword")} error={errors.newPassword?.message} />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" {...form.register("confirm")} error={errors.confirm?.message} />
        <Button type="submit" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </div>
  );
}
