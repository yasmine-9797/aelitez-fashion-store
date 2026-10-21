// Small building blocks for admin screens.
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, type OrderPaymentStatus, type OrderStatus } from "@shared/order-status";
import { Overlay } from "@/components/shop/Overlay";
import { Alert, Spinner } from "@/components/shop/ui";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-4xl md:text-5xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("border bg-paper p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-bold uppercase tracking-widest">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string | undefined; tone?: "alert" | undefined }) {
  return (
    <div className={cn("border bg-paper p-5", tone === "alert" && "border-brand")}>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-3xl font-bold tabular-nums", tone === "alert" && "text-brand")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const STATUS_STYLE: Partial<Record<OrderStatus, string>> = {
  PENDING_PAYMENT: "border-brand text-brand",
  CONFIRMED: "border-ink bg-ink text-paper",
  PROCESSING: "border-ink",
  PACKED: "border-ink",
  SHIPPED: "border-ink",
  DELIVERED: "border-ink bg-muted",
  CANCELLED: "border-muted-foreground text-muted-foreground",
  RETURN_REQUESTED: "border-brand bg-brand text-paper",
  RETURNED: "border-ink",
  REFUNDED: "border-muted-foreground text-muted-foreground",
};

export function Badge({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return <span className={cn("inline-block whitespace-nowrap border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider", className)}>{children}</span>;
}
export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <Badge className={STATUS_STYLE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
export const PaymentBadge = ({ status }: { status: OrderPaymentStatus }) => <Badge className={status === "PAID" ? "border-ink" : status === "FAILED" ? "border-brand text-brand" : "border-muted-foreground text-muted-foreground"}>{PAYMENT_STATUS_LABEL[status]}</Badge>;

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto border bg-paper">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b bg-muted/60 text-xs uppercase tracking-wider">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-3 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
      {empty && <p className="p-6 text-center text-sm text-muted-foreground">Nothing to show.</p>}
    </div>
  );
}

export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn("px-4 py-3 align-top", className)}>{children}</td>;

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-3 text-sm">
      <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid size-9 place-items-center border disabled:opacity-40">
        <ChevronLeft className="size-4" />
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button type="button" aria-label="Next page" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="grid size-9 place-items-center border disabled:opacity-40">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export function QueryState({ query, children }: { query: { isLoading: boolean; isError: boolean; error: unknown }; children: ReactNode }) {
  if (query.isLoading) return <Spinner />;
  if (query.isError) return <Alert tone="error">{isApiError(query.error) ? query.error.message : "Couldn't load this data."}</Alert>;
  return <>{children}</>;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Overlay open={open} onClose={onClose} label={title} side="center" className="max-w-2xl p-6 md:p-8">
      <h2 className="mb-6 pr-10 text-2xl font-bold">{title}</h2>
      {children}
    </Overlay>
  );
}

export const linkClass = "font-semibold text-ink underline-offset-4 hover:text-brand hover:underline";
