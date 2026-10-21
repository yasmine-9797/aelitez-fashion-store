import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { profileSchema, type ProfileInput } from "@shared/validation";
import { Alert, Button, CheckboxField, TextField } from "@/components/shop/ui";
import { api, isApiError } from "@/lib/api";
import { applyApiErrors } from "@/lib/forms";
import { useConfig, useMe, useUpdateProfile } from "@/lib/queries";

export const Route = createFileRoute("/_store/account/")({ component: Profile });

function Profile() {
  const me = useMe();
  const config = useConfig();
  const update = useUpdateProfile();
  const user = me.data!;
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: { name: user.name, phone: user.phone ?? "", marketingConsent: user.marketingConsent } });
  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    update.mutate(values, { onSuccess: () => toast.success("Profile updated"), onError: (err) => setError(applyApiErrors(err, form.setError)) });
  });
  const resend = async () => {
    setSending(true);
    try {
      await api("/auth/resend-verification", { method: "POST" });
      toast.success("Confirmation email sent", { description: `Check ${user.email}` });
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Couldn't send the email");
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="max-w-xl space-y-8">
      {!user.emailVerified && config.data?.emailEnabled && (
        <Alert tone="info" title="Please confirm your email">
          We sent a confirmation link to {user.email}.{" "}
          <button type="button" onClick={resend} disabled={sending} className="font-bold underline">
            Resend link
          </button>
        </Alert>
      )}
      <section>
        <h2 className="text-xl font-bold">Profile</h2>
        <form method="post" onSubmit={onSubmit} className="mt-5 space-y-5" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <TextField label="Email" value={user.email} disabled readOnly hint="Contact us to change the email on your account." />
          <TextField label="Full name" autoComplete="name" {...form.register("name")} error={form.formState.errors.name?.message} />
          <TextField label="Mobile number" optional type="tel" autoComplete="tel-national" {...form.register("phone")} error={form.formState.errors.phone?.message} />
          <CheckboxField label="Email me about new arrivals and offers" {...form.register("marketingConsent")} />
          <Button type="submit" loading={update.isPending}>
            Save changes
          </Button>
        </form>
      </section>
    </div>
  );
}
