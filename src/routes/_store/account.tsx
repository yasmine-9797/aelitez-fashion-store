import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Container, Spinner } from "@/components/shop/ui";
import { useLogout, useMe } from "@/lib/queries";
import { privateHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_store/account")({
  head: () => privateHead("My account"),
  component: AccountLayout,
});

const NAV = [
  { to: "/account", label: "Profile", exact: true },
  { to: "/account/orders", label: "Orders" },
  { to: "/account/addresses", label: "Addresses" },
  { to: "/account/wishlist", label: "Wishlist" },
  { to: "/account/security", label: "Password" },
] as const;

function AccountLayout() {
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useLogout();
  useEffect(() => {
    if (me.isSuccess && !me.data) void navigate({ to: "/login", search: { redirect: location.pathname }, replace: true });
  }, [me.isSuccess, me.data, navigate, location.pathname]);

  if (!me.data) {
    return (
      <Container className="py-16">
        <Spinner label="Loading your account" />
      </Container>
    );
  }
  return (
    <Container className="py-10 md:py-14">
      <p className="eyebrow text-brand">My account</p>
      <h1 className="display mt-3 text-5xl md:text-7xl">Hi, {me.data.name.split(" ")[0]}</h1>
      <div className="mt-10 grid gap-10 lg:grid-cols-12">
        <nav aria-label="Account" className="lg:col-span-3">
          <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:pb-0">
            {NAV.map((n) => (
              <li key={n.to}>
                <Link
                  to={n.to}
                  activeOptions={{ exact: "exact" in n }}
                  className="block whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold hover:bg-muted lg:rounded-none lg:border-l-2 lg:border-transparent lg:px-4"
                  activeProps={{ className: cn("bg-ink text-paper hover:bg-ink lg:border-brand lg:bg-transparent lg:text-brand lg:hover:bg-muted") }}
                >
                  {n.label}
                </Link>
              </li>
            ))}
            {(me.data.role === "ADMIN" || me.data.role === "STAFF") && (
              <li>
                <Link to="/admin" className="block whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-brand hover:bg-muted lg:rounded-none">
                  Store admin →
                </Link>
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={() => logout.mutate(undefined, { onSuccess: () => { toast("You're signed out"); void navigate({ to: "/" }); } })}
                className="block w-full whitespace-nowrap px-4 py-2 text-left text-sm font-semibold text-muted-foreground hover:text-brand"
              >
                Sign out
              </button>
            </li>
          </ul>
        </nav>
        <div className="lg:col-span-9">
          <Outlet />
        </div>
      </div>
    </Container>
  );
}
