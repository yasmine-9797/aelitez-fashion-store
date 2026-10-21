import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { loginSchema, type LoginInput } from "@shared/validation";
import { AuthShell, redirectSearchSchema, safeRedirect } from "@/components/shop/AuthShell";
import { Alert, Button, TextField } from "@/components/shop/ui";
import { applyApiErrors } from "@/lib/forms";
import { useLogin } from "@/lib/queries";
import { privateHead } from "@/lib/seo";

export const Route = createFileRoute("/_store/login")({
  validateSearch: (s) => redirectSearchSchema.parse(s),
  head: () => privateHead("Sign in"),
  component: Login,
});

function Login() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const login = useLogin();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    login.mutate(values, {
      onSuccess: () => void navigate({ to: safeRedirect(redirect) }),
      onError: (err) => setError(applyApiErrors(err, form.setError)),
    });
  });
  const { errors } = form.formState;
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to check out, track orders and see your wishlist."
      footer={
        <>
          New to AELITEZ?{" "}
          <Link to="/register" search={redirect ? { redirect } : {}} className="font-bold text-brand underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <form method="post" onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="Email" type="email" autoComplete="email" {...form.register("email")} error={errors.email?.message} />
        <TextField label="Password" type="password" autoComplete="current-password" {...form.register("password")} error={errors.password?.message} />
        <div className="text-right text-sm">
          <Link to="/forgot-password" className="font-semibold underline underline-offset-4 hover:text-brand">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
