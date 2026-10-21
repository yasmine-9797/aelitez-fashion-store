import { Link } from "@tanstack/react-router";
import { ChevronDown, Heart, Instagram, Menu, Search, ShoppingBag, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AGE_BANDS, type AgeBand, type Department } from "@shared/catalog";
import type { CategoryDTO } from "@shared/types";
import { Logo, Wordmark } from "@/components/shop/Logo";
import { Overlay } from "@/components/shop/Overlay";
import { BRAND, external } from "@/lib/brand";
import { useCart, useCategories, useMe, useShippingMethods } from "@/lib/queries";
import { formatINR } from "@shared/money";
import { cn } from "@/lib/utils";
import { CartDrawer } from "./CartDrawer";
import { SearchOverlay } from "./SearchOverlay";

const DEPTS: { department: Department; label: string; to: "/kids" | "/women" }[] = [
  { department: "KIDS", label: "Kids", to: "/kids" },
  { department: "WOMEN", label: "Women", to: "/women" },
];

function AnnouncementBar() {
  const methods = useShippingMethods();
  const free = (methods.data ?? []).map((m) => m.freeAbovePaise).filter((v): v is number => v != null);
  return (
    <div className="bg-ink text-paper">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] md:px-8">
        <p>
          <span className="text-brand-bright">Kids &amp; women</span> • {free.length ? `Free delivery on orders above ${formatINR(Math.min(...free))}` : "Premium looks, prices you'll love"}
        </p>
        <a href="/#stores" className="hidden underline-offset-4 hover:underline sm:inline">
          Visit our Tiruppur store →
        </a>
      </div>
    </div>
  );
}

function flatten(cats: CategoryDTO[]): CategoryDTO[] {
  return cats.flatMap((c) => [c, ...flatten(c.children)]);
}

function DeptMenu({ department, label, to, open, setOpen }: (typeof DEPTS)[number] & { open: boolean; setOpen: (v: boolean) => void }) {
  const cats = useCategories(department);
  const top = cats.data ?? [];
  return (
    // Not `relative`: the panel is positioned against the header bar so it spans the page width and
    // can never be cut off at the screen edge, wherever this menu item sits.
    <div onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <div className="flex items-center">
        <Link to={to} className="relative py-6 text-sm font-semibold tracking-wide transition-colors after:absolute after:bottom-4 after:left-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:bg-brand after:transition-transform hover:text-brand hover:after:scale-x-100" activeProps={{ className: "text-brand" }}>
          {label}
        </Link>
        <button type="button" aria-expanded={open} aria-label={`Show ${label} categories`} onClick={() => setOpen(!open)} className="ml-0.5 p-1 hover:text-brand">
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && top.length > 0 && (
        <div className="absolute inset-x-4 top-full z-50 border bg-paper p-8 shadow-2xl md:inset-x-8">
          <div className="grid max-w-4xl grid-cols-3 gap-8">
            {top.some((c) => c.children.length) ? (
              top.map((c) => (
                <div key={c.id}>
                  <Link to={to} search={{ category: c.slug }} onClick={() => setOpen(false)} className="eyebrow text-brand hover:underline">
                    {c.name}
                  </Link>
                  <ul className="mt-3 space-y-2 text-sm">
                    {c.children.map((ch) => (
                      <li key={ch.id}>
                        <Link to={to} search={{ category: ch.slug }} onClick={() => setOpen(false)} className="hover:text-brand">
                          {ch.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <>
                <ul className="col-span-2 grid grid-cols-2 content-start gap-x-8 gap-y-2.5 text-sm">
                  {flatten(top).map((c) => (
                    <li key={c.id}>
                      <Link to={to} search={{ category: c.slug }} onClick={() => setOpen(false)} className="hover:text-brand">
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                {department === "KIDS" && (
                  <div>
                    <p className="eyebrow text-brand">Shop by age</p>
                    <ul className="mt-3 space-y-2 text-sm">
                      {(Object.keys(AGE_BANDS) as AgeBand[]).map((age) => (
                        <li key={age}>
                          <Link to="/kids" search={{ age }} onClick={() => setOpen(false)} className="hover:text-brand">
                            {AGE_BANDS[age].label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
          <Link to={to} onClick={() => setOpen(false)} className="mt-6 inline-block text-sm font-bold text-brand underline underline-offset-4">
            Shop all {label.toLowerCase()}
          </Link>
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cn("relative grid size-10 place-items-center rounded-full transition-colors hover:bg-muted hover:text-brand", className)}>
      {children}
    </button>
  );
}

function MobileMenu({ open, onClose, signedIn }: { open: boolean; onClose: () => void; signedIn: boolean }) {
  const kids = useCategories("KIDS");
  const women = useCategories("WOMEN");
  const [expanded, setExpanded] = useState<Department | null>(null);
  return (
    <Overlay open={open} onClose={onClose} label="Menu" side="left" className="overflow-y-auto p-8">
      <div className="mb-10 flex items-center gap-3 pr-12">
        <Logo alt="" className="size-12" />
        <Wordmark className="text-[2rem]" />
      </div>
      <nav aria-label="Mobile" className="flex flex-col gap-3">
        {DEPTS.map((d) => {
          const cats = flatten((d.department === "KIDS" ? kids.data : women.data) ?? []);
          return (
            <div key={d.department}>
              <div className="flex items-center justify-between">
                <Link to={d.to} onClick={onClose} className="display text-5xl hover:text-brand">
                  {d.label}
                </Link>
                {cats.length > 0 && (
                  <button type="button" aria-expanded={expanded === d.department} aria-label={`${d.label} categories`} onClick={() => setExpanded(expanded === d.department ? null : d.department)} className="p-2">
                    <ChevronDown className={cn("size-6 transition-transform", expanded === d.department && "rotate-180")} />
                  </button>
                )}
              </div>
              {expanded === d.department && (
                <ul className="mt-2 grid grid-cols-2 gap-2 pb-2 text-sm">
                  {cats.map((c) => (
                    <li key={c.id}>
                      <Link to={d.to} search={{ category: c.slug }} onClick={onClose} className="hover:text-brand">
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        <Link to="/shop" search={{ sort: "newest" }} onClick={onClose} className="display text-5xl hover:text-brand">
          New in
        </Link>
        <a href="/#stores" onClick={onClose} className="display text-5xl hover:text-brand">
          Stores
        </a>
      </nav>
      <div aria-hidden className="mt-10 h-0.75 w-16 bg-brand" />
      <div className="mt-6 flex flex-col gap-3 text-sm font-semibold">
        <Link to={signedIn ? "/account" : "/login"} onClick={onClose} className="inline-flex items-center gap-2 hover:text-brand">
          <User className="size-5" /> {signedIn ? "My account" : "Sign in / Register"}
        </Link>
        <a href={BRAND.instagramUrl} {...external} className="inline-flex items-center gap-2 hover:text-brand">
          <Instagram className="size-5" /> {BRAND.instagramHandle}
        </a>
      </div>
    </Overlay>
  );
}

export function SiteHeader() {
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [bag, setBag] = useState(false);
  const [openDept, setOpenDept] = useState<Department | null>(null);
  const cart = useCart();
  const me = useMe();
  const count = cart.data?.itemCount ?? 0;
  const headerRef = useRef<HTMLElement>(null);

  // Let other components open the bag (e.g. after "Add to bag").
  useEffect(() => {
    const open = () => setBag(true);
    window.addEventListener("aez:open-bag", open);
    return () => window.removeEventListener("aez:open-bag", open);
  }, []);
  useEffect(() => {
    if (!openDept) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenDept(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openDept]);

  return (
    <>
      <div aria-hidden className="h-0.75 bg-brand" />
      <AnnouncementBar />
      <header ref={headerRef} className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="relative mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 md:h-20 md:px-8">
          <button type="button" className="lg:hidden" aria-label="Open menu" onClick={() => setMenu(true)}>
            <Menu className="size-6" />
          </button>
          <Link to="/" className="flex items-center gap-2.5 md:gap-3" aria-label="AELITEZ CLOTHINGS home">
            <Logo alt="" className="size-10 md:size-12" />
            <Wordmark className="text-[1.65rem] md:text-[2rem]" />
          </Link>
          <nav aria-label="Main" className="ml-10 hidden items-center gap-7 lg:flex">
            {DEPTS.map((d) => (
              <DeptMenu key={d.department} {...d} open={openDept === d.department} setOpen={(v) => setOpenDept(v ? d.department : null)} />
            ))}
            <Link to="/shop" search={{ sort: "newest" }} className="text-sm font-semibold tracking-wide hover:text-brand">
              New in
            </Link>
            <a href="/#stores" className="text-sm font-semibold tracking-wide hover:text-brand">
              Stores
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <IconBtn label="Search products" onClick={() => setSearch(true)}>
              <Search className="size-5" />
            </IconBtn>
            <Link to={me.data ? "/account" : "/login"} aria-label={me.data ? "My account" : "Sign in"} className="hidden size-10 place-items-center rounded-full hover:bg-muted hover:text-brand sm:grid">
              <User className="size-5" />
            </Link>
            <Link to="/account/wishlist" aria-label="Wishlist" className="hidden size-10 place-items-center rounded-full hover:bg-muted hover:text-brand sm:grid">
              <Heart className="size-5" />
            </Link>
            <IconBtn label={`Open bag, ${count} item${count === 1 ? "" : "s"}`} onClick={() => setBag(true)}>
              <ShoppingBag className="size-5" />
              {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-paper">{count}</span>}
            </IconBtn>
          </div>
        </div>
      </header>
      <MobileMenu open={menu} onClose={() => setMenu(false)} signedIn={Boolean(me.data)} />
      <SearchOverlay open={search} onClose={() => setSearch(false)} />
      <CartDrawer open={bag} onClose={() => setBag(false)} />
    </>
  );
}

export const openBag = () => window.dispatchEvent(new Event("aez:open-bag"));
