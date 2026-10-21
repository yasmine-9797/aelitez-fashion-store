import { Outlet, createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { useReveal } from "@/lib/reveal";

/** Storefront layout: header, footer and skip link around every customer-facing page. */
export const Route = createFileRoute("/_store")({ component: StoreLayout });

function StoreLayout() {
  useReveal();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-brand focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="min-h-[60vh]">
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}
