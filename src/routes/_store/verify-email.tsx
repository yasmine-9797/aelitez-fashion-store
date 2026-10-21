import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { AuthShell } from "@/components/shop/AuthShell";
import { Alert, ButtonLink, Spinner } from "@/components/shop/ui";
import { api, isApiError } from "@/lib/api";
import { qk } from "@/lib/queries";
import { privateHead } from "@/lib/seo";

export const Route = createFileRoute("/_store/verify-email")({
  validateSearch: (s) => z.object({ token: z.string().max(200).optional().catch(undefined) }).parse(s),
  head: () => ({ meta: [...privateHead("Confirm your email").meta, { name: "referrer", content: "no-referrer" }] }),
  component: VerifyEmail,
});

function VerifyEmail() {
  const { token } = Route.useSearch();
  const qc = useQueryClient();
  const [state, setState] = useState<"working" | "done" | string>(token ? "working" : "This confirmation link is incomplete.");
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api("/auth/verify-email", { method: "POST", body: { token } })
      .then(() => {
        setState("done");
        void qc.invalidateQueries({ queryKey: qk.me });
      })
      .catch((err) => setState(isApiError(err) ? err.message : "We couldn't confirm your email."));
  }, [token, qc]);
  return (
    <AuthShell title="Confirm email">
      {state === "working" ? (
        <Spinner label="Confirming your email" />
      ) : state === "done" ? (
        <div className="space-y-6">
          <Alert tone="success" title="Email confirmed">
            Thanks — your email address is verified.
          </Alert>
          <ButtonLink to="/shop" className="w-full" size="lg">
            Start shopping
          </ButtonLink>
        </div>
      ) : (
        <Alert tone="error">{state}</Alert>
      )}
    </AuthShell>
  );
}
