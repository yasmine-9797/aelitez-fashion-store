import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast, Toaster } from "sonner";
import {
  ArrowRight, Heart, Instagram, MapPin, Menu, Minus, Navigation, Plus, Search, ShoppingBag, Star, Trash2, User,
} from "lucide-react";
import heroImg from "@/assets/hero.jpg";
import campaignImg from "@/assets/campaign.jpg";
import womenImg from "@/assets/women.jpg";
import menImg from "@/assets/men.jpg";
import {
  CATEGORIES, DIRECTIONS_URL, INSTAGRAM_URL, MAPS_URL, PRODUCTS, STORE_ADDRESS, filterProducts, inr,
  type Category, type Product, type SortKey,
} from "@/lib/catalog";
import { useShop } from "@/lib/store";
import { Overlay } from "@/components/shop/Overlay";
import { SmartImage } from "@/components/shop/SmartImage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AELITEZ CLOTHINGS — Trendiest Fashion in India, Premium for Less | Tiruppur" },
      { name: "description", content: "Trend-led men's, women's and everyday ethnic fashion at fair prices. Visit AELITEZ CLOTHINGS at ABT Road, Karuvampalayam, Tiruppur." },
      { property: "og:title", content: "AELITEZ CLOTHINGS — Premium for Less" },
      { property: "og:description", content: "Style that speaks. Prices that make sense. Trend-led fashion from Tiruppur." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Storefront,
});

const NAV = [
  { label: "Shop", href: "#shop" },
  { label: "New Arrivals", href: "#trending" },
  { label: "Collections", href: "#collections" },
  { label: "Our Story", href: "#story" },
  { label: "Stores", href: "#stores" },
];
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))), { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function Storefront() {
  const shop = useShop();
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [active, setActive] = useState<Product | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "All">("All");
  const [sort, setSort] = useState<SortKey>("featured");
  useReveal();

  const products = useMemo(() => filterProducts(PRODUCTS, { query, category, sort }), [query, category, sort]);

  const add = (p: Product, size: string, color: string, qty = 1) => {
    shop.addToCart(p, size, color, qty);
    toast.success(`${p.name} added to bag`, { description: `Size ${size} · ${color} · Qty ${qty}`, action: { label: "View bag", onClick: () => setCartOpen(true) } });
  };
  const wish = (p: Product) => {
    const added = !shop.wishlist.includes(p.id);
    shop.toggleWish(p.id);
    toast(added ? "Saved to wishlist" : "Removed from wishlist", { description: p.name });
  };
  const goCategory = (c: Category) => { setCategory(c); document.getElementById("trending")?.scrollIntoView(); };

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-accent focus:px-4 focus:py-2">Skip to content</a>

      {/* 1. Announcement */}
      <div className="bg-ink text-ivory">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-2 text-[11px] font-semibold tracking-[0.18em] uppercase md:px-8">
          <p><span className="text-accent">Trending now</span> • Premium looks, prices you’ll love</p>
          <a href="#stores" className="hidden underline-offset-4 hover:underline sm:inline">Visit our Tiruppur store →</a>
        </div>
      </div>

      {/* 2. Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 md:h-20 md:px-8">
          <button className="lg:hidden" aria-label="Open menu" onClick={() => setMenu(true)}><Menu className="size-6" /></button>
          <a href="#top" className="display text-3xl md:text-4xl" aria-label="AELITEZ home">Aelitez</a>
          <nav aria-label="Main" className="ml-10 hidden gap-8 lg:flex">
            {NAV.map((n) => <a key={n.href} href={n.href} className="text-sm font-semibold tracking-wide hover:text-muted-foreground">{n.label}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <IconBtn label="Search products" onClick={() => setSearchOpen(true)}><Search className="size-5" /></IconBtn>
            <IconBtn label="Account (coming soon)" onClick={() => toast("Accounts are coming soon", { description: "Sign-in will be available once customer accounts are connected." })} className="hidden sm:grid"><User className="size-5" /></IconBtn>
            <IconBtn label={`Wishlist, ${shop.wishlist.length} items`} onClick={() => { setCategory("All"); document.getElementById("trending")?.scrollIntoView(); toast(`${shop.wishlist.length} saved item(s)`, { description: "Hearted pieces are marked in the grid." }); }} className="hidden sm:grid">
              <Heart className="size-5" />
            </IconBtn>
            <IconBtn label={`Open bag, ${shop.count} items`} onClick={() => setCartOpen(true)} className="relative">
              <ShoppingBag className="size-5" />
              {shop.count > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">{shop.count}</span>}
            </IconBtn>
          </div>
        </div>
      </header>

      <main id="main">
        {/* 3. Hero */}
        <section id="top" className="relative overflow-hidden">
          <div className="mx-auto grid max-w-[1440px] gap-8 px-4 pb-12 pt-8 md:px-8 lg:grid-cols-12 lg:gap-6 lg:pb-20 lg:pt-14">
            <div className="relative z-10 flex flex-col justify-center lg:col-span-6">
              <p className="eyebrow mb-6 flex items-center gap-3"><span className="h-px w-10 bg-foreground" />The new everyday</p>
              <h1 className="display text-[15vw] sm:text-[11vw] lg:text-[7.4rem] xl:text-[8.6rem]">
                Style that speaks.<br />
                <span className="relative inline-block">Prices that<span className="absolute -inset-x-2 bottom-1 -z-10 h-[38%] bg-accent" /></span><br />make sense.
              </h1>
              <p className="mt-8 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
                The trendiest fashion in India — premium for less. Trend-led fits for him, her and every day in between, made to look good and priced to feel good.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Btn href="#shop" variant="accent">Shop the Collection <ArrowRight className="size-4" /></Btn>
                <Btn href="#trending" variant="outline">Explore New Arrivals</Btn>
              </div>
            </div>
            <div className="relative lg:col-span-6">
              <span aria-hidden className="display text-outline pointer-events-none absolute -left-6 top-4 z-10 hidden text-[9rem] text-foreground/70 xl:block">SS’26</span>
              <div className="relative ml-auto aspect-[4/5] w-full max-w-[580px] overflow-hidden bg-card">
                <img src={heroImg} alt="Two models in relaxed linen and oversized streetwear from the AELITEZ campaign" width={1280} height={1600} className="h-full w-full object-cover" fetchPriority="high" />
                <div className="absolute bottom-0 left-0 bg-ink px-5 py-4 text-ivory">
                  <p className="eyebrow text-accent">Campaign 01</p>
                  <p className="display mt-1 text-2xl">The Easy Edit</p>
                </div>
              </div>
              <p aria-hidden className="eyebrow absolute -right-2 top-1/2 hidden origin-center rotate-90 text-muted-foreground lg:block">Tiruppur · Tamil Nadu · India</p>
            </div>
          </div>
        </section>

        {/* 4. Trust strip */}
        <section aria-label="Why customers choose AELITEZ" className="overflow-hidden border-y bg-ink py-5 text-ivory">
          <div className="flex w-max animate-marquee gap-12">
            {[0, 1].map((k) => (
              <ul key={k} className="flex shrink-0 gap-12" aria-hidden={k === 1}>
                {["1L+ Happy Customers", "4.9★ Customer Rating", "4 Stores Strong", "Premium for Less", "Best Quality & Price", "Next Franchise Loading…"].map((t) => (
                  <li key={t} className="display flex items-center gap-12 whitespace-nowrap text-3xl md:text-4xl">{t}<Star className="size-5 fill-accent text-accent" /></li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        {/* 5. Categories */}
        <section id="shop" className="mx-auto max-w-[1440px] px-4 py-20 md:px-8 md:py-28">
          <SectionHead eyebrow="Shop by category" title="Find your fit" />
          <div id="collections" className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {([
              ["Women", womenImg, true],
              ["Men", menImg, true],
              ["Ethnic & Everyday", campaignImg, true],
              ["Accessories", "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&h=1000&q=75", false],
            ] as const).map(([c, img], i) => (
              <button key={c} onClick={() => goCategory(c)} className={cn("reveal group relative aspect-[3/4] overflow-hidden bg-card text-left", i % 2 === 1 && "md:mt-12")}>
                <SmartImage src={img} alt={`${c} category`} loading="lazy" className={cn("h-full w-full object-cover transition-transform duration-700 group-hover:scale-105", c === "Ethnic & Everyday" && "object-[62%_center]")} />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-ivory md:p-6">
                  <span className="display text-2xl md:text-4xl">{c}</span>
                  <span className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground transition-transform group-hover:-rotate-45"><ArrowRight className="size-4" /></span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* 6. Product grid */}
        <section id="trending" className="bg-card/60 py-20 md:py-28">
          <div className="mx-auto max-w-[1440px] px-4 md:px-8">
            <SectionHead eyebrow="Popular picks" title="Trending now" note="Sample catalogue — demo products for layout. Real styles & prices to be added by the store." />
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
                {(["All", ...CATEGORIES] as const).map((c) => (
                  <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}
                    className={cn("rounded-full border px-4 py-2 text-sm font-semibold transition-colors", category === c ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground")}>{c}</button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                {query && <button onClick={() => setQuery("")} className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold">“{query}” ✕</button>}
                <label className="text-sm font-semibold" htmlFor="sort">Sort</label>
                <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-full border bg-background px-4 py-2 text-sm font-semibold">
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                </select>
              </div>
            </div>
            {products.length === 0 ? (
              <div className="py-20 text-center">
                <p className="display text-4xl">No matches</p>
                <button className="mt-4 underline" onClick={() => { setQuery(""); setCategory("All"); }}>Clear filters</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-10 md:gap-x-5 lg:grid-cols-4">
                {products.map((p) => <ProductCard key={p.id} p={p} wished={shop.wishlist.includes(p.id)} onWish={() => wish(p)} onOpen={() => setActive(p)} onAdd={add} />)}
              </div>
            )}
          </div>
        </section>

        {/* 7. Campaign banner */}
        <section className="relative grid bg-ink text-ivory lg:grid-cols-2">
          <div className="relative min-h-[420px] overflow-hidden lg:order-2">
            <img src={campaignImg} alt="Model in a printed cotton co-ord walking through sunlit architecture" loading="lazy" width={1600} height={912} className="absolute inset-0 h-full w-full object-cover object-[60%_center]" />
          </div>
          <div className="reveal flex flex-col justify-center px-6 py-16 md:px-16 lg:py-28">
            <p className="eyebrow text-accent">New season</p>
            <h2 className="display mt-5 text-6xl md:text-8xl">Good style shouldn’t cost more</h2>
            <p className="mt-6 max-w-md text-ivory/70 md:text-lg">Discover your next favourite fit — fresh silhouettes, easy fabrics and everyday prices.</p>
            <div className="mt-8"><Btn href="#trending" variant="accent">Discover the edit <ArrowRight className="size-4" /></Btn></div>
          </div>
        </section>

        {/* 8. Story */}
        <section id="story" className="mx-auto grid max-w-[1440px] gap-12 px-4 py-20 md:px-8 md:py-32 lg:grid-cols-12">
          <div className="reveal lg:col-span-5">
            <p className="eyebrow mb-5">Our story</p>
            <h2 className="display text-6xl md:text-8xl">Premium<br />for <span className="bg-accent px-2">less.</span></h2>
          </div>
          <div className="reveal space-y-6 text-lg leading-relaxed text-muted-foreground lg:col-span-6 lg:col-start-7">
            <p className="text-2xl font-semibold leading-snug text-foreground md:text-3xl">We believe looking good shouldn’t come with a premium price tag.</p>
            <p>AELITEZ CLOTHINGS brings the trends you see everywhere to a price that makes sense — choosing fits, fabrics and finishes that feel great to wear, day after day.</p>
            <p>From our home in Tiruppur, Tamil Nadu, we focus on what matters: the best quality and price, styles that move with the season, and a store experience our customers keep coming back to.</p>
            <dl className="grid grid-cols-3 gap-4 border-t pt-8">
              {[["1L+", "Happy customers"], ["4.9★", "Rating"], ["4", "Stores strong"]].map(([v, l]) => (
                <div key={l}><dt className="sr-only">{l}</dt><dd className="display text-4xl text-foreground md:text-5xl">{v}</dd><dd className="mt-1 text-sm">{l}</dd></div>
              ))}
            </dl>
            <p className="text-xs">Figures as shared by AELITEZ CLOTHINGS.</p>
          </div>
        </section>

        {/* 9. Instagram */}
        <section aria-labelledby="ig" className="border-t py-20 md:py-28">
          <div className="mx-auto max-w-[1440px] px-4 md:px-8">
            <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div><p className="eyebrow mb-4">On the gram</p><h2 id="ig" className="display text-5xl md:text-7xl">Follow @aelitezclothings</h2></div>
              <Btn href={INSTAGRAM_URL} variant="primary" external><Instagram className="size-4" /> Follow on Instagram</Btn>
            </div>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
              {[heroImg, PRODUCTS[0]!.image, womenImg, PRODUCTS[2]!.image, menImg, PRODUCTS[5]!.image].map((src, i) => (
                <a key={i} href={INSTAGRAM_URL} {...ext} aria-label={`View AELITEZ on Instagram (opens in new tab), image ${i + 1}`} className="group relative aspect-square overflow-hidden bg-card">
                  <SmartImage src={src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <span className="absolute inset-0 grid place-items-center bg-ink/0 opacity-0 transition group-hover:bg-ink/40 group-hover:opacity-100"><Instagram className="size-7 text-ivory" /></span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* 10. Store */}
        <section id="stores" className="bg-accent text-accent-foreground">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-20 md:px-8 md:py-28 lg:grid-cols-2">
            <div className="reveal">
              <p className="eyebrow mb-5">Visit the store</p>
              <h2 className="display text-6xl md:text-8xl">See it. Try it.<br />Love it.</h2>
              <p className="mt-6 max-w-md text-lg">Come try on the latest drops at our Tiruppur store — 4 stores strong, with the next franchise loading.</p>
            </div>
            <div className="reveal flex flex-col justify-end gap-6 border-t-2 border-ink pt-8 lg:border-l-2 lg:border-t-0 lg:pl-12 lg:pt-0">
              <address className="flex gap-4 text-2xl font-semibold not-italic leading-snug md:text-3xl">
                <MapPin className="mt-1 size-7 shrink-0" />{STORE_ADDRESS}
              </address>
              <div className="flex flex-wrap gap-3">
                <Btn href={DIRECTIONS_URL} variant="primary" external><Navigation className="size-4" /> Get directions</Btn>
                <Btn href={MAPS_URL} variant="outline" external><MapPin className="size-4" /> View on Google Maps</Btn>
                <Btn href={INSTAGRAM_URL} variant="outline" external><Instagram className="size-4" /> Message on Instagram</Btn>
              </div>
              <p className="text-sm">For store timings and enquiries, please message us on Instagram.</p>
            </div>
          </div>
        </section>

        {/* 11. Newsletter */}
        <Newsletter />
      </main>

      {/* 12. Footer */}
      <footer className="bg-ink text-ivory">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-4 py-16 md:grid-cols-12 md:px-8">
          <div className="md:col-span-4">
            <p className="display text-6xl">Aelitez</p>
            <p className="mt-2 eyebrow text-accent">Clothings</p>
            <p className="mt-6 max-w-xs text-ivory/70">The trendiest fashion in India • Premium for less.</p>
            <a href={INSTAGRAM_URL} {...ext} className="mt-6 inline-flex items-center gap-2 font-semibold hover:text-accent"><Instagram className="size-5" /> @aelitezclothings</a>
          </div>
          <FooterCol title="Shop" items={[...CATEGORIES.map((c) => ({ label: c, onClick: () => goCategory(c) })), { label: "New Arrivals", href: "#trending" }]} />
          <FooterCol title="Brand" items={[{ label: "Our Story", href: "#story" }, { label: "Stores", href: "#stores" }, { label: "Instagram", href: INSTAGRAM_URL, external: true }]} />
          <FooterCol title="Policies" items={["Shipping", "Returns & Exchanges", "Privacy Policy", "Terms of Service"].map((l) => ({ label: l, onClick: () => toast(`${l} page — to be added`, { description: "This policy page is a placeholder for the store to fill in." }) }))} note="Placeholder pages — to be filled in" />
          <div className="md:col-span-2">
            <h3 className="eyebrow mb-4 text-ivory/50">Store</h3>
            <address className="not-italic text-sm leading-relaxed text-ivory/80">{STORE_ADDRESS}</address>
            <a href={MAPS_URL} {...ext} className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">Open in Maps</a>
          </div>
        </div>
        <div className="border-t border-ivory/10">
          <p className="mx-auto max-w-[1440px] px-4 py-6 text-xs text-ivory/50 md:px-8">© {new Date().getFullYear()} AELITEZ CLOTHINGS, Tiruppur. Product listings shown are sample content.</p>
        </div>
      </footer>

      {/* Overlays */}
      <Overlay open={menu} onClose={() => setMenu(false)} label="Menu" side="left" className="p-8 pt-20">
        <nav aria-label="Mobile" className="flex flex-col gap-4">
          {NAV.map((n) => <a key={n.href} href={n.href} onClick={() => setMenu(false)} className="display text-5xl">{n.label}</a>)}
        </nav>
        <a href={INSTAGRAM_URL} {...ext} className="mt-10 inline-flex items-center gap-2 font-semibold"><Instagram className="size-5" /> @aelitezclothings</a>
      </Overlay>

      <Overlay open={searchOpen} onClose={() => setSearchOpen(false)} label="Search products" side="top" className="p-6 md:p-10">
        <form onSubmit={(e) => { e.preventDefault(); setCategory("All"); setSearchOpen(false); document.getElementById("trending")?.scrollIntoView(); }} className="mx-auto max-w-3xl">
          <label htmlFor="q" className="eyebrow">Search the collection</label>
          <div className="mt-3 flex items-center gap-3 border-b-2 border-foreground pb-2 pr-12">
            <Search className="size-6" />
            <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Try “kurta”, “tee”, “women”…" className="display w-full bg-transparent text-3xl outline-none placeholder:text-muted-foreground/50 md:text-5xl" />
          </div>
          <ul className="mt-6 max-h-[50vh] divide-y overflow-y-auto">
            {filterProducts(PRODUCTS, { query, category: "All", sort: "featured" }).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { setSearchOpen(false); setActive(p); }} className="flex w-full items-center gap-4 py-3 text-left hover:bg-muted">
                  <SmartImage src={p.image} alt="" className="size-14 object-cover" />
                  <span className="flex-1"><span className="block font-semibold">{p.name}</span><span className="text-sm text-muted-foreground">{p.category}</span></span>
                  <span className="font-bold">{inr(p.price)}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="submit" className="mt-4 text-sm font-semibold underline">Show results in grid</button>
        </form>
      </Overlay>

      <ProductModal product={active} onClose={() => setActive(null)} onAdd={(...a) => { add(...a); setActive(null); }} wished={!!active && shop.wishlist.includes(active.id)} onWish={() => active && wish(active)} />

      <Overlay open={cartOpen} onClose={() => setCartOpen(false)} label="Shopping bag" side="right" className="flex flex-col">
        <div className="border-b p-6"><h2 className="display text-4xl">Your bag ({shop.count})</h2></div>
        {shop.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <ShoppingBag className="size-12 text-muted-foreground" />
            <p className="text-lg font-semibold">Your bag is empty</p>
            <Btn href="#trending" variant="primary" onClick={() => setCartOpen(false)}>Start shopping</Btn>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y overflow-y-auto px-6">
              {shop.lines.map((l) => (
                <li key={l.key} className="flex gap-4 py-5">
                  <SmartImage src={l.product.image} alt={l.product.name} className="h-28 w-22 shrink-0 object-cover" />
                  <div className="flex flex-1 flex-col">
                    <p className="font-semibold">{l.product.name}</p>
                    <p className="text-sm text-muted-foreground">{l.size} · {l.color}</p>
                    <div className="mt-auto flex items-center justify-between">
                      <Qty value={l.qty} onChange={(q) => shop.setQty(l.key, q)} label={l.product.name} />
                      <p className="font-bold">{inr(l.qty * l.product.price)}</p>
                    </div>
                  </div>
                  <button aria-label={`Remove ${l.product.name}`} onClick={() => { shop.setQty(l.key, 0); toast("Removed from bag", { description: l.product.name }); }} className="self-start p-1 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                </li>
              ))}
            </ul>
            <div className="space-y-4 border-t p-6">
              <div className="flex justify-between text-lg font-bold"><span>Subtotal</span><span>{inr(shop.subtotal)}</span></div>
              <p className="rounded bg-muted p-3 text-sm">Demo checkout — payment/order placement is not connected yet. No payment will be taken.</p>
              <button onClick={() => toast("Checkout isn’t connected yet", { description: "No order was placed. Visit the Tiruppur store or message us on Instagram." })} className="w-full rounded-full bg-accent py-4 font-bold text-accent-foreground hover:brightness-95">Checkout (demo)</button>
            </div>
          </>
        )}
      </Overlay>

      <Toaster position="bottom-center" toastOptions={{ className: "!rounded-none !border-foreground" }} />
    </>
  );
}

/* ---------- pieces ---------- */

function IconBtn({ label, className, children, onClick }: { label: string; className?: string; children: React.ReactNode; onClick: () => void }) {
  return <button aria-label={label} onClick={onClick} className={cn("grid size-10 place-items-center rounded-full hover:bg-muted", className)}>{children}</button>;
}

function Btn({ href, variant, external, onClick, children }: { href: string; variant: "accent" | "primary" | "outline"; external?: boolean; onClick?: () => void; children: React.ReactNode }) {
  const v = {
    accent: "bg-accent text-accent-foreground hover:bg-foreground hover:text-background",
    primary: "bg-foreground text-background hover:bg-accent hover:text-accent-foreground",
    outline: "border-2 border-current hover:bg-foreground hover:text-background hover:border-foreground",
  }[variant];
  return <a href={href} onClick={onClick} {...(external ? ext : {})} className={cn("inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold tracking-wide transition-colors", v)}>{children}</a>;
}

function SectionHead({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <div className="reveal mb-10 flex flex-col justify-between gap-4 md:mb-14 md:flex-row md:items-end">
      <div><p className="eyebrow mb-4">{eyebrow}</p><h2 className="display text-6xl md:text-8xl">{title}</h2></div>
      {note && <p className="max-w-xs text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

function ProductCard({ p, wished, onWish, onOpen, onAdd }: { p: Product; wished: boolean; onWish: () => void; onOpen: () => void; onAdd: (p: Product, s: string, c: string) => void }) {
  return (
    <article className="group">
      <div className="relative aspect-[4/5] overflow-hidden bg-card">
        <button onClick={onOpen} className="block h-full w-full" aria-label={`View ${p.name}`}>
          <SmartImage src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        </button>
        {p.badge && <span className={cn("absolute left-3 top-3 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest", p.badge === "New" ? "bg-accent text-accent-foreground" : "bg-ink text-ivory")}>{p.badge}</span>}
        <button onClick={onWish} aria-pressed={wished} aria-label={wished ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`} className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-background/90 transition hover:scale-110">
          <Heart className={cn("size-4", wished && "fill-foreground")} />
        </button>
        <div className="absolute inset-x-2 bottom-2 flex flex-wrap justify-center gap-1 bg-background/95 p-2 opacity-100 transition md:translate-y-2 md:opacity-0 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100 md:group-hover:translate-y-0 md:group-hover:opacity-100">
          <span className="w-full text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Quick add</span>
          {p.sizes.map((s) => (
            <button key={s} onClick={() => onAdd(p, s, p.colors[0]!.name)} aria-label={`Quick add ${p.name}, size ${s}`} className="min-w-8 border px-1.5 py-1 text-xs font-semibold hover:bg-foreground hover:text-background">{s}</button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{p.category}</p>
          <h3 className="mt-1 font-semibold leading-tight"><button onClick={onOpen} className="text-left hover:underline">{p.name}</button></h3>
        </div>
        <div className="flex gap-1 pt-1">{p.colors.map((c) => <span key={c.name} title={c.name} className="size-3 rounded-full border" style={{ backgroundColor: c.hex }} />)}</div>
      </div>
      <p className="mt-1.5 font-bold">{inr(p.price)}{p.compareAt && <s className="ml-2 text-sm font-normal text-muted-foreground">{inr(p.compareAt)}</s>}</p>
    </article>
  );
}

function ProductModal({ product, onClose, onAdd, wished, onWish }: { product: Product | null; onClose: () => void; onAdd: (p: Product, s: string, c: string, q: number) => void; wished: boolean; onWish: () => void }) {
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState("");
  const [qty, setQty] = useState(1);
  useEffect(() => { if (product) { setSize(product.sizes.length === 1 ? product.sizes[0]! : null); setColor(product.colors[0]!.name); setQty(1); } }, [product]);
  if (!product) return null;
  return (
    <Overlay open onClose={onClose} label={product.name} side="center">
      <div className="grid md:grid-cols-2">
        <SmartImage src={product.image} alt={product.name} className="aspect-[4/5] h-full w-full object-cover" />
        <div className="flex flex-col p-6 md:p-10">
          <p className="eyebrow text-muted-foreground">{product.category} · Sample product</p>
          <h2 className="display mt-3 text-4xl md:text-5xl">{product.name}</h2>
          <p className="mt-3 text-2xl font-bold">{inr(product.price)}{product.compareAt && <s className="ml-3 text-base font-normal text-muted-foreground">{inr(product.compareAt)}</s>}</p>
          <p className="mt-4 text-muted-foreground">{product.description}</p>
          <fieldset className="mt-6"><legend className="mb-2 text-sm font-bold">Colour: <span className="font-normal">{color}</span></legend>
            <div className="flex gap-2">{product.colors.map((c) => (
              <button key={c.name} onClick={() => setColor(c.name)} aria-pressed={color === c.name} aria-label={c.name} className={cn("size-8 rounded-full border-2 ring-offset-2 ring-offset-background", color === c.name ? "ring-2 ring-foreground" : "")} style={{ backgroundColor: c.hex }} />
            ))}</div>
          </fieldset>
          <fieldset className="mt-6"><legend className="mb-2 text-sm font-bold">Size</legend>
            <div className="flex flex-wrap gap-2">{product.sizes.map((s) => (
              <button key={s} onClick={() => setSize(s)} aria-pressed={size === s} className={cn("min-w-12 border px-3 py-2.5 text-sm font-semibold", size === s ? "border-foreground bg-foreground text-background" : "hover:border-foreground")}>{s}</button>
            ))}</div>
          </fieldset>
          <div className="mt-6 flex items-center gap-4"><span className="text-sm font-bold">Qty</span><Qty value={qty} onChange={(q) => setQty(Math.max(1, q))} label={product.name} /></div>
          <div className="mt-8 flex gap-3">
            <button onClick={() => (size ? onAdd(product, size, color, qty) : toast.error("Please select a size"))} className="flex-1 rounded-full bg-accent py-4 font-bold text-accent-foreground hover:bg-foreground hover:text-background">Add to bag — {inr(product.price * qty)}</button>
            <button onClick={onWish} aria-pressed={wished} aria-label="Toggle wishlist" className="grid size-14 place-items-center rounded-full border-2 border-foreground"><Heart className={cn("size-5", wished && "fill-foreground")} /></button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function Qty({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center border">
      <button aria-label={`Decrease quantity of ${label}`} onClick={() => onChange(value - 1)} className="grid size-9 place-items-center hover:bg-muted"><Minus className="size-3.5" /></button>
      <span className="w-8 text-center text-sm font-bold" aria-live="polite">{value}</span>
      <button aria-label={`Increase quantity of ${label}`} onClick={() => onChange(value + 1)} disabled={value >= 10} className="grid size-9 place-items-center hover:bg-muted disabled:opacity-40"><Plus className="size-3.5" /></button>
    </div>
  );
}

function FooterCol({ title, items, note }: { title: string; items: { label: string; href?: string; external?: boolean; onClick?: () => void }[]; note?: string }) {
  return (
    <div className="md:col-span-2">
      <h3 className="eyebrow mb-4 text-ivory/50">{title}</h3>
      <ul className="space-y-2.5 text-sm">
        {items.map((i) => (
          <li key={i.label}>{i.href
            ? <a href={i.href} {...(i.external ? ext : {})} className="hover:text-accent">{i.label}</a>
            : <button onClick={i.onClick} className="text-left hover:text-accent">{i.label}</button>}</li>
        ))}
      </ul>
      {note && <p className="mt-3 text-xs text-ivory/40">{note}</p>}
    </div>
  );
}

function Newsletter() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg({ ok: false, text: "Please enter a valid email address." });
    if (!consent) return setMsg({ ok: false, text: "Please tick the consent box to continue." });
    setMsg({ ok: true, text: "Thanks! This is a demo form — your email was not sent or stored anywhere yet. Follow us on Instagram for the latest drops." });
    setEmail(""); setConsent(false);
  };
  return (
    <section aria-labelledby="nl" className="mx-auto max-w-[1440px] px-4 py-20 md:px-8 md:py-28">
      <div className="reveal grid gap-10 lg:grid-cols-2 lg:items-end">
        <div><p className="eyebrow mb-4">Stay in the loop</p><h2 id="nl" className="display text-6xl md:text-8xl">First look at new drops</h2></div>
        <form onSubmit={submit} noValidate>
          <label htmlFor="nl-email" className="sr-only">Email address</label>
          <div className="flex border-b-2 border-foreground">
            <input id="nl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" className="w-full bg-transparent py-4 text-lg outline-none" />
            <button type="submit" className="flex items-center gap-2 font-bold hover:text-muted-foreground">Sign up <ArrowRight className="size-4" /></button>
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm text-muted-foreground">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-foreground" />
            I agree to receive emails from AELITEZ CLOTHINGS about new arrivals and offers. I can unsubscribe anytime.
          </label>
          {msg && <p role="status" className={cn("mt-4 text-sm font-semibold", !msg.ok && "text-destructive")}>{msg.text}</p>}
        </form>
      </div>
    </section>
  );
}
