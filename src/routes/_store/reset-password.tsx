import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { passwordSchema } from "@shared/validation";
import { AuthShell } from "@/components/shop/AuthShell";
import { Alert, Button, ButtonLink, TextField } from "@/components/shop/ui";
import { api } from "@/lib/api";
import { applyApiErrors } from "@/lib/forms";
import { privateHead } from "@/lib/seo";

const schema = z.object({ password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] });

export const Route = createFileRoute("/_store/reset-password")({
  validateSearch: (s) => z.object({ token: z.string().max(200).optional().catch(undefined) }).parse(s),
  // The reset token is in the URL — keep it out of Referer headers and search indexes.
  head: () => ({ ...privateHead("Choose a new password"), meta: [...privateHead("Choose a new password").meta, { name: "referrer", content: "no-referrer" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token } = Route.useSearch();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });
  const onSubmit = form.handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(applyApiErrors(err, form.setError));
    }
  });
  if (!token) {
    return (
      <AuthShell title="Link not valid" footer={<Link to="/forgot-password" className="font-bold text-brand underline">Request a new link</Link>}>
        <Alert tone="error">This password reset link is incomplete. Please use the link from your email, or request a new one.</Alert>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="New password" subtitle="Choose a strong password you haven't used here before.">
      {done ? (
        <div className="space-y-6">
          <Alert tone="success" title="Password updated">
            You've been signed out everywhere for safety. Sign in with your new password.
          </Alert>
          <ButtonLink to="/login" className="w-full" size="lg">
            Sign in
          </ButtonLink>
        </div>
      ) : (
        <form method="post" onSubmit={onSubmit} className="space-y-5" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <TextField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters, with a letter and a number." {...form.register("password")} error={form.formState.errors.password?.message} />
          <TextField label="Confirm password" type="password" autoComplete="new-password" {...form.register("confirm")} error={form.formState.errors.confirm?.message} />
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
