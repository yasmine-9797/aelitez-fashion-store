import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { z } from "zod";
import { Logo } from "./Logo";

/** Only same-site paths are accepted as post-login destinations (no open redirects). */
export const redirectSearchSchema = z.object({
  redirect: z
    .string()
    .max(300)
    .refine((v) => v.startsWith("/") && !v.startsWith("//") && !v.includes("\\"), "invalid")
    .optional()
    .catch(undefined),
});
export const safeRedirect = (v: string | undefined, fallback = "/account") => (v && v.startsWith("/") && !v.startsWith("//") ? v : fallback);

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <Link to="/" aria-label="AELITEZ CLOTHINGS home" className="mx-auto mb-8">
        <Logo alt="" className="size-20" />
      </Link>
      <h1 className="display text-center text-5xl md:text-6xl">{title}</h1>
      {subtitle && <p className="mt-3 text-center text-muted-foreground">{subtitle}</p>}
      <div className="mt-10">{children}</div>
      {footer && <div className="mt-8 border-t pt-6 text-center text-sm">{footer}</div>}
    </div>
  );
}
