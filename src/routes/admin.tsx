import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Boxes, ClipboardList, FolderTree, Gauge, LogOut, Mail, Menu, MessageSquare, Package, Palette, RotateCcw, ScrollText, Store, Tag, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo, Wordmark } from "@/components/shop/Logo";
import { ButtonLink, Spinner } from "@/components/shop/ui";
import { can, isStaff, type Perm } from "@/lib/admin";
import { useLogout, useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Store admin | AELITEZ CLOTHINGS" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AdminLayout,
});

const NAV: { to: string; label: string; icon: typeof Gauge; perm?: Perm; exact?: boolean }[] = [
  { to: "/admin", label: "Dashboard", icon: Gauge, exact: true },
  { to: "/admin/orders", label: "Orders", icon: ClipboardList },
  { to: "/admin/returns", label: "Returns", icon: RotateCcw },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/inventory", label: "Inventory", icon: Boxes },
  { to: "/admin/categories", label: "Categories", icon: FolderTree },
  { to: "/admin/options", label: "Sizes & colours", icon: Palette },
  { to: "/admin/reviews", label: "Reviews", icon: MessageSquare },
  { to: "/admin/coupons", label: "Coupons", icon: Tag, perm: "coupons" },
  { to: "/admin/shipping", label: "Delivery", icon: Truck, perm: "settings" },
  { to: "/admin/newsletter", label: "Newsletter", icon: Mail, perm: "newsletter" },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText, perm: "audit" },
];

function AdminLayout() {
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (me.isSuccess && !me.data) void navigate({ to: "/login", search: { redirect: location.pathname }, replace: true });
  }, [me.isSuccess, me.data, navigate, location.pathname]);
  useEffect(() => setOpen(false), [location.pathname]);

  if (!me.data) return <div className="p-10"><Spinner label="Checking access" /></div>;
  if (!isStaff(me.data.role)) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <Logo alt="" className="mx-auto size-20" />
        <h1 className="display mt-6 text-5xl">No access</h1>
        <p className="mt-3 text-muted-foreground">This area is for AELITEZ staff. You're signed in as {me.data.email}.</p>
        <ButtonLink to="/" className="mt-6">Back to the store</ButtonLink>
      </div>
    );
  }
  const role = me.data.role;
  const items = NAV.filter((n) => !n.perm || can(role, n.perm));
  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-0.5">
      {items.map(({ to, label, icon: Icon, exact }) => (
        <Link
          key={to}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- route paths are listed above
          to={to as any}
          activeOptions={{ exact: Boolean(exact) }}
          className="flex items-center gap-3 border-l-2 border-transparent px-4 py-2.5 text-sm font-semibold text-paper/75 hover:bg-paper/5 hover:text-paper"
          activeProps={{ className: "!border-brand !text-paper bg-paper/10" }}
        >
          <Icon className="size-4" aria-hidden /> {label}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen bg-muted/50 lg:grid lg:grid-cols-[250px_1fr]">
      <aside className={cn("bg-ink text-paper lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto", open ? "fixed inset-0 z-50 overflow-y-auto" : "hidden")}>
        <div className="flex items-center gap-3 px-4 py-5">
          <Logo alt="" className="size-10" />
          <Wordmark tone="dark" className="text-2xl" />
        </div>
        <p className="mb-2 px-4 text-[10px] font-bold uppercase tracking-[0.3em] text-paper/40">Store admin</p>
        {nav}
        <div className="mt-6 space-y-1 border-t border-paper/10 px-4 py-4 text-sm">
          <p className="truncate text-paper/60">
            {me.data.name} · {role === "ADMIN" ? "Admin" : "Staff"}
          </p>
          <Link to="/" className="flex items-center gap-2 py-1.5 font-semibold text-paper/75 hover:text-paper">
            <Store className="size-4" /> View store
          </Link>
          <button type="button" onClick={() => logout.mutate(undefined, { onSuccess: () => void navigate({ to: "/" }) })} className="flex items-center gap-2 py-1.5 font-semibold text-paper/75 hover:text-brand-bright">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
        {open && (
          <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-5 text-sm font-bold underline lg:hidden">
            Close
          </button>
        )}
      </aside>
      <div className="min-w-0">
        <header className="flex items-center gap-3 border-b bg-paper px-4 py-3 lg:hidden">
          <button type="button" aria-label="Open admin menu" onClick={() => setOpen(true)}>
            <Menu className="size-6" />
          </button>
          <span className="font-bold">Store admin</span>
        </header>
        <main className="p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
