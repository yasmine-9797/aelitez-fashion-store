import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { registerSchema, type RegisterInput } from "@shared/validation";
import { AuthShell, redirectSearchSchema, safeRedirect } from "@/components/shop/AuthShell";
import { Alert, Button, CheckboxField, TextField } from "@/components/shop/ui";
import { applyApiErrors } from "@/lib/forms";
import { useRegister } from "@/lib/queries";
import { privateHead } from "@/lib/seo";

export const Route = createFileRoute("/_store/register")({
  validateSearch: (s) => redirectSearchSchema.parse(s),
  head: () => privateHead("Create an account"),
  component: Register,
});

function Register() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const register = useRegister();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RegisterInput>({ resolver: zodResolver(registerSchema), defaultValues: { name: "", email: "", password: "", marketingConsent: false } });
  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    register.mutate(values, {
      onSuccess: () => void navigate({ to: safeRedirect(redirect) }),
      onError: (err) => setError(applyApiErrors(err, form.setError)),
    });
  });
  const { errors } = form.formState;
  return (
    <AuthShell
      title="Join AELITEZ"
      subtitle="Faster checkout, order tracking and a wishlist that follows you."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" search={redirect ? { redirect } : {}} className="font-bold text-brand underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <form method="post" onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="Full name" autoComplete="name" {...form.register("name")} error={errors.name?.message} />
        <TextField label="Email" type="email" autoComplete="email" {...form.register("email")} error={errors.email?.message} />
        <TextField label="Password" type="password" autoComplete="new-password" hint="At least 8 characters, with a letter and a number." {...form.register("password")} error={errors.password?.message} />
        <CheckboxField label="Send me new arrivals and offers by email. I can unsubscribe at any time." {...form.register("marketingConsent")} />
        <Button type="submit" size="lg" className="w-full" loading={register.isPending}>
          Create account
        </Button>
        <p className="text-xs text-muted-foreground">
          By creating an account you agree to our{" "}
          <Link to="/policies/$slug" params={{ slug: "terms" }} className="underline">
            terms
          </Link>{" "}
          and{" "}
          <Link to="/policies/$slug" params={{ slug: "privacy" }} className="underline">
            privacy policy
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  );
}
