// Storefront UI kit — red, black and white only (see styles.css tokens).
import { Link, type LinkComponentProps } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Info, Loader2, Minus, Plus } from "lucide-react";
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// ───────────── Buttons ─────────────

export type ButtonVariant = "brand" | "dark" | "light" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export function buttonClass(variant: ButtonVariant = "brand", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-bold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    { sm: "px-4 py-2 text-xs", md: "px-6 py-3.5 text-sm", lg: "px-8 py-4 text-base" }[size],
    {
      brand: "bg-brand text-paper hover:bg-brand-deep",
      dark: "bg-ink text-paper hover:bg-brand",
      light: "bg-paper text-ink hover:bg-ink hover:text-paper",
      outline: "border-2 border-current hover:border-ink hover:bg-ink hover:text-paper",
      ghost: "hover:bg-muted",
    }[variant],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant, size, loading, className, children, disabled, type = "button", ...rest }, ref) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

type ButtonLinkProps = LinkComponentProps<"a"> & { variant?: ButtonVariant; size?: ButtonSize; className?: string };
export function ButtonLink({ variant, size, className, ...rest }: ButtonLinkProps) {
  return <Link {...rest} className={buttonClass(variant, size, className)} />;
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}…
    </span>
  );
}

// ───────────── Typography & layout ─────────────

/** Small caps label with the brand rule; colour follows `className` (red by default). */
export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn("eyebrow flex items-center gap-3 text-brand", className)}>
      <span aria-hidden className="h-0.5 w-8 bg-current" />
      {children}
    </p>
  );
}

export function SectionHead({ eyebrow, title, action, note, id }: { eyebrow?: string; title: ReactNode; action?: ReactNode; note?: string; id?: string }) {
  return (
    <div className="reveal mb-8 flex flex-col justify-between gap-4 md:mb-12 md:flex-row md:items-end">
      <div>
        {eyebrow && <Eyebrow className="mb-4">{eyebrow}</Eyebrow>}
        <h2 id={id} className="display text-5xl md:text-7xl">
          {title}
        </h2>
      </div>
      {(action || note) && (
        <div className="flex flex-col items-start gap-3 md:items-end">
          {note && <p className="max-w-xs text-sm text-muted-foreground md:text-right">{note}</p>}
          {action}
        </div>
      )}
    </div>
  );
}

export const Container = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn("mx-auto w-full max-w-[1440px] px-4 md:px-8", className)}>{children}</div>
);

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="display text-4xl">{title}</p>
      {body && <div className="max-w-md text-muted-foreground">{body}</div>}
      {action}
    </div>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "error" | "success"; title?: string; children?: ReactNode; className?: string }) {
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 border-l-4 p-4 text-sm",
        tone === "error" ? "border-brand bg-brand/5 text-ink" : tone === "success" ? "border-ink bg-muted text-ink" : "border-muted-foreground/40 bg-muted text-ink",
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-brand" : "text-ink")} aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-bold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cn("animate-pulse bg-muted", className)} />;

// ───────────── Quantity ─────────────

export function QtyStepper({ value, onChange, min = 1, max, label, disabled }: { value: number; onChange: (n: number) => void; min?: number; max: number; label: string; disabled?: boolean }) {
  return (
    <div className="inline-flex items-center border">
      <button type="button" aria-label={`Decrease quantity of ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)} className="grid size-10 place-items-center hover:bg-muted disabled:opacity-40">
        <Minus className="size-3.5" />
      </button>
      <span className="w-9 text-center text-sm font-bold" aria-live="polite" aria-label={`Quantity ${value}`}>
        {value}
      </span>
      <button type="button" aria-label={`Increase quantity of ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)} className="grid size-10 place-items-center hover:bg-muted disabled:opacity-40">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

// ───────────── Form fields ─────────────

const fieldClass = (error?: string) =>
  cn(
    "w-full rounded-none border bg-paper px-4 py-3 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ink focus-visible:outline-none",
    error ? "border-brand" : "border-border",
  );

function FieldShell({ id, label, error, hint, children, optional }: { id: string; label: string; error?: string | undefined; hint?: string | undefined; children: ReactNode; optional?: boolean | undefined }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-semibold text-brand">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

type FieldProps = { label: string; error?: string | undefined; hint?: string | undefined; optional?: boolean | undefined };

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function TextField({ label, error, hint, optional, id, className, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} error={error} hint={hint} optional={optional}>
      <input ref={ref} id={fid} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, error, hint)} className={cn(fieldClass(error), className)} {...rest} />
    </FieldShell>
  );
});

export const SelectField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(function SelectField({ label, error, hint, optional, id, className, children, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} error={error} hint={hint} optional={optional}>
      <select ref={ref} id={fid} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, error, hint)} className={cn(fieldClass(error), "appearance-auto", className)} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
});

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function TextAreaField({ label, error, hint, optional, id, className, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} error={error} hint={hint} optional={optional}>
      <textarea ref={ref} id={fid} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, error, hint)} className={cn(fieldClass(error), "min-h-28", className)} {...rest} />
    </FieldShell>
  );
});

export const CheckboxField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string | undefined }>(function CheckboxField({ label, error, id, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div>
      <label htmlFor={fid} className="flex items-start gap-3 text-sm">
        <input ref={ref} id={fid} type="checkbox" aria-invalid={error ? true : undefined} className="mt-0.5 size-4 shrink-0 accent-brand" {...rest} />
        <span>{label}</span>
      </label>
      {error && <p className="mt-1 text-xs font-semibold text-brand">{error}</p>}
    </div>
  );
});
