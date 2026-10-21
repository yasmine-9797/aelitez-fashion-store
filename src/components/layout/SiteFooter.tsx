import { Link } from "@tanstack/react-router";
import { Instagram } from "lucide-react";
import { Logo, Wordmark } from "@/components/shop/Logo";
import { BRAND, MAPS_URL, external } from "@/lib/brand";
import { useCategories } from "@/lib/queries";

const linkClass = "transition-colors hover:text-brand-bright";

export function SiteFooter() {
  const kids = useCategories("KIDS");
  const women = useCategories("WOMEN");
  return (
    <footer className="bg-ink text-paper">
      <div aria-hidden className="h-0.75 bg-brand" />
      <div className="mx-auto grid max-w-[1440px] gap-12 px-4 py-16 md:grid-cols-12 md:px-8">
        <div className="md:col-span-4">
          <div className="flex items-center gap-4">
            <Logo alt="" className="size-20" />
            <Wordmark tone="dark" className="text-5xl" />
          </div>
          <p className="mt-6 max-w-xs text-paper/70">{BRAND.tagline}. Trend-led fashion for little ones and women.</p>
          <a href={BRAND.instagramUrl} {...external} className={`mt-6 inline-flex items-center gap-2 font-semibold ${linkClass}`}>
            <Instagram className="size-5" /> {BRAND.instagramHandle}
          </a>
        </div>
        <FooterCol title="Kids">
          {(kids.data ?? []).slice(0, 6).map((c) => (
            <li key={c.id}>
              <Link to="/kids" search={{ category: c.slug }} className={linkClass}>
                {c.name}
              </Link>
            </li>
          ))}
          <li>
            <Link to="/kids" className={linkClass}>
              All kids
            </Link>
          </li>
        </FooterCol>
        <FooterCol title="Women">
          {(women.data ?? []).slice(0, 6).map((c) => (
            <li key={c.id}>
              <Link to="/women" search={{ category: c.slug }} className={linkClass}>
                {c.name}
              </Link>
            </li>
          ))}
          <li>
            <Link to="/women" className={linkClass}>
              All women
            </Link>
          </li>
        </FooterCol>
        <FooterCol title="Help">
          {(
            [
              ["shipping", "Shipping & delivery"],
              ["returns", "Returns & exchanges"],
              ["privacy", "Privacy policy"],
              ["terms", "Terms of service"],
            ] as const
          ).map(([slug, label]) => (
            <li key={slug}>
              <Link to="/policies/$slug" params={{ slug }} className={linkClass}>
                {label}
              </Link>
            </li>
          ))}
          <li>
            <Link to="/account/orders" className={linkClass}>
              Track an order
            </Link>
          </li>
        </FooterCol>
        <div className="md:col-span-2">
          <h3 className="eyebrow mb-4 text-paper/50">Store</h3>
          <address className="text-sm not-italic leading-relaxed text-paper/80">{BRAND.storeAddress}</address>
          <a href={MAPS_URL} {...external} className="mt-3 inline-block text-sm font-semibold text-brand-bright hover:underline">
            Open in Maps
          </a>
        </div>
      </div>
      <div className="border-t border-paper/10">
        <p className="mx-auto max-w-[1440px] px-4 py-6 text-xs text-paper/50 md:px-8">
          © {new Date().getFullYear()} {BRAND.name}, Tiruppur. Customer figures are as shared by AELITEZ CLOTHINGS.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="md:col-span-2">
      <h3 className="eyebrow mb-4 text-paper/50">{title}</h3>
      <ul className="space-y-2.5 text-sm">{children}</ul>
    </div>
  );
}
