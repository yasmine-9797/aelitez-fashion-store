import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { forgotPasswordSchema } from "@shared/validation";
import type { z } from "zod";
import { AuthShell } from "@/components/shop/AuthShell";
import { Alert, Button, TextField } from "@/components/shop/ui";
import { api } from "@/lib/api";
import { applyApiErrors } from "@/lib/forms";
import { useConfig } from "@/lib/queries";
import { privateHead } from "@/lib/seo";

export const Route = createFileRoute("/_store/forgot-password")({
  head: () => privateHead("Reset your password"),
  component: ForgotPassword,
});

function ForgotPassword() {
  const config = useConfig();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api<{ message: string }>("/auth/forgot-password", { method: "POST", body: values });
      setDone(res.message);
    } catch (err) {
      setError(applyApiErrors(err, form.setError));
    }
  });
  return (
    <AuthShell title="Forgot password?" subtitle="Enter your email and we'll send you a link to choose a new password." footer={<Link to="/login" className="font-bold text-brand underline underline-offset-4">Back to sign in</Link>}>
      {config.data && !config.data.emailEnabled && (
        <Alert tone="info" className="mb-6" title="Email isn't set up yet">
          The store hasn't connected an email service, so reset links can't be delivered right now. Please message us on Instagram for help.
        </Alert>
      )}
      {done ? (
        <Alert tone="success" title="Check your inbox">
          {done} The link is valid for 30 minutes.
        </Alert>
      ) : (
        <form method="post" onSubmit={onSubmit} className="space-y-5" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <TextField label="Email" type="email" autoComplete="email" {...form.register("email")} error={form.formState.errors.email?.message} />
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
