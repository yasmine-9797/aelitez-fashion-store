import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Instagram, MapPin, Navigation, RotateCcw, ShieldCheck, Star, Store, Truck } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { CategoryDTO, ProductCardDTO } from "@shared/types";
import { newsletterSchema } from "@shared/validation";
import campaignKids from "@/assets/campaign-kids.webp";
import campaignWomen from "@/assets/campaign-women.webp";
import heroKids from "@/assets/hero-kids.webp";
import heroWomen from "@/assets/hero-women.webp";
import tileBaby from "@/assets/tile-baby.webp";
import tileBoys from "@/assets/tile-boys.webp";
import tileGirls from "@/assets/tile-girls.webp";
import tileTeens from "@/assets/tile-teens.webp";
import tileWomen from "@/assets/tile-women.webp";
import { Logo } from "@/components/shop/Logo";
import { ProductGrid } from "@/components/shop/ProductCard";
import { Alert, Button, ButtonLink, Container, Eyebrow, SectionHead } from "@/components/shop/ui";
import { api, isApiError } from "@/lib/api";
import { BRAND, DIRECTIONS_URL, MAPS_URL, external } from "@/lib/brand";
import { fetchHome, useCategories, useConfig, useHome, useShippingMethods, type HomeData } from "@/lib/queries";
import { imageAt } from "@/lib/images";
import { absoluteUrl, pageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { formatINR } from "@shared/money";

export const Route = createFileRoute("/_store/")({
  // Rendered on the server for SEO; if the API is unreachable the page still renders its brand content.
  loader: async () => ({ home: await fetchHome().catch(() => null) }),
  head: () => ({
    ...pageHead({
      title: "AELITEZ CLOTHINGS — Kids' & Women's Fashion, Premium for Less | Tiruppur",
      description: "Trend-led fashion for little ones and women, with quality and style at prices you'll love. Shop online or visit AELITEZ CLOTHINGS at ABT Road, Karuvampalayam, Tiruppur.",
      path: "/",
      image: absoluteUrl(heroWomen),
    }),
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ClothingStore",
          name: BRAND.name,
          url: absoluteUrl("/"),
          sameAs: [BRAND.instagramUrl],
          address: { "@type": "PostalAddress", streetAddress: "No. 49, ABT Road, Karuvampalayam", addressLocality: "Tiruppur", addressRegion: "Tamil Nadu", addressCountry: "IN" },
        }),
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { home: initial } = Route.useLoaderData();
  const home = useHome(initial);
  const data = home.data ?? null;
  return (
    <>
      <Hero />
      <TrustStrip />
      <CategoryTiles />
      <ProductSection
        id="new-arrivals"
        eyebrow="Just landed"
        title="New arrivals"
        products={data?.newArrivals}
        loading={home.isLoading}
        error={home.isError && !data}
        action={<ButtonLink to="/shop" search={{ sort: "newest" }} variant="outline" size="sm">View all <ArrowRight className="size-4" /></ButtonLink>}
        priority
      />
      <Campaign
        image={campaignKids}
        alt="Child in a traditional red and green silk pavadai set"
        eyebrow="Kids' collection"
        title={<>Little looks.<br /><span className="text-brand">Big style.</span></>}
        body="From baby basics to party frocks and festive sets — comfortable fabrics, playful details and sizes for every stage."
        cta={{ label: "Shop kids", to: "/kids" }}
        products={data?.kids}
      />
      <Campaign
        image={campaignWomen}
        alt="Woman in a black embroidered salwar suit with a printed dupatta"
        eyebrow="Women's collection"
        title={<>Everyday<br /><span className="text-brand">confidence.</span></>}
        body="Kurtas, co-ords, dresses and occasion wear — trend-led pieces that look premium and feel easy, priced to make sense."
        cta={{ label: "Shop women", to: "/women" }}
        products={data?.women}
        reverse
      />
      <Collections categories={data?.featuredCategories ?? []} />
      {data && data.onSale.length > 0 && <ProductSection id="offers" eyebrow="Seasonal offers" title={<>On <span className="text-brand">offer</span></>} products={data.onSale} note="Discounts shown are calculated from each product's real prices." action={<ButtonLink to="/shop" search={{ minDiscount: 10 }} variant="outline" size="sm">Shop all offers</ButtonLink>} />}
      {data && data.bestsellers.length > 0 && <ProductSection id="bestsellers" eyebrow="Customer favourites" title="Bestsellers" products={data.bestsellers} note="Ranked by real orders." />}
      {data && data.testimonials.length > 0 && <Testimonials items={data.testimonials} />}
      <WhyAelitez />
      <InstagramGrid />
      <StoreVisit />
      <Newsletter />
    </>
  );
}

// ───────────── Hero ─────────────

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <Container className="grid gap-10 pb-14 pt-8 lg:grid-cols-12 lg:gap-6 lg:pb-20 lg:pt-14">
        <div className="relative z-10 flex flex-col justify-center lg:col-span-6">
          <Eyebrow className="mb-6">Kids &amp; women · Premium for less</Eyebrow>
          <h1 className="display text-[15vw] sm:text-[11vw] lg:text-[7.2rem] xl:text-[8.4rem]">
            Every age.
            <br />
            <span className="text-brand">Every style.</span>
          </h1>
          <p className="mt-6 text-xl font-semibold md:text-2xl">Little looks. Big style. Everyday confidence.</p>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
            Discover trend-led fashion for little ones and women, with quality and style at prices you'll love.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/shop" search={{ sort: "newest" }}>
              Shop new arrivals <ArrowRight className="size-4" />
            </ButtonLink>
            <a href="#collections" className="inline-flex items-center gap-2 rounded-full border-2 border-current px-6 py-3.5 text-sm font-bold tracking-wide transition-colors hover:border-ink hover:bg-ink hover:text-paper">
              Explore collections
            </a>
          </div>
        </div>
        <div className="relative lg:col-span-6">
          <div className="relative ml-auto aspect-[4/5] w-[82%] max-w-[520px] overflow-hidden bg-card">
            <img src={heroWomen} alt="Woman in a red crepe kurta and pant co-ord from the women's collection" width={1400} height={1750} fetchPriority="high" className="h-full w-full object-cover" />
            <Logo alt="" className="absolute right-4 top-4 size-16 shadow-xl md:size-20" />
          </div>
          <div className="absolute bottom-[-6%] left-0 aspect-[4/5] w-[44%] max-w-[260px] overflow-hidden border-[6px] border-paper bg-card shadow-2xl">
            <img src={heroKids} alt="Girl in a pink party frock from the kids' collection" width={900} height={1125} className="h-full w-full object-cover" />
          </div>
        </div>
      </Container>
    </section>
  );
}

function TrustStrip() {
  return (
    <section aria-label="Why customers choose AELITEZ" className="mt-6 overflow-hidden bg-ink py-5 text-paper">
      <div className="flex w-max animate-marquee gap-12">
        {[0, 1].map((k) => (
          <ul key={k} className="flex shrink-0 gap-12" aria-hidden={k === 1}>
            {BRAND.claims.map((t) => (
              <li key={t} className="display flex items-center gap-12 whitespace-nowrap text-3xl md:text-4xl">
                {t}
                <Star className="size-5 fill-brand-bright text-brand-bright" aria-hidden />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}

// ───────────── Category tiles ─────────────

const TILES = [
  { label: "Women", image: tileWomen, to: "/women" as const, category: undefined, department: "WOMEN" as const },
  { label: "Girls", image: tileGirls, to: "/kids" as const, category: "girls", department: "KIDS" as const },
  { label: "Boys", image: tileBoys, to: "/kids" as const, category: "boys", department: "KIDS" as const },
  { label: "Baby", image: tileBaby, to: "/kids" as const, category: "baby-clothing", department: "KIDS" as const },
  { label: "Teens", image: tileTeens, to: "/kids" as const, category: "teen-girls", department: "KIDS" as const },
];

const flat = (cats: CategoryDTO[]): CategoryDTO[] => cats.flatMap((c) => [c, ...flat(c.children)]);

function CategoryTiles() {
  const kids = useCategories("KIDS");
  const women = useCategories("WOMEN");
  // Hide a tile only once we know its category has no products.
  const visible = TILES.filter((t) => {
    const list = t.department === "KIDS" ? kids.data : women.data;
    if (!list) return true;
    return t.category ? flat(list).some((c) => c.slug === t.category && c.productCount > 0) : list.length > 0;
  });
  if (!visible.length) return null;
  return (
    <section id="collections" className="py-20 md:py-28">
      <Container>
        <SectionHead eyebrow="Shop by category" title="Find their fit — and yours" />
        <div className={cn("grid grid-cols-2 gap-3 md:gap-5", visible.length >= 5 ? "lg:grid-cols-5" : "md:grid-cols-4")}>
          {visible.map((t, i) => (
            <Link key={t.label} to={t.to} search={t.category ? { category: t.category } : {}} className={cn("reveal group relative aspect-[3/4] overflow-hidden bg-card", i % 2 === 1 && "md:mt-10", i === 0 && visible.length % 2 === 1 && "col-span-2 aspect-[3/2] md:col-span-1 md:aspect-[3/4]")}>
              <img src={t.image} alt="" loading="lazy" width={900} height={1200} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-paper md:p-5">
                <span className="display text-3xl md:text-4xl">{t.label}</span>
                <span className="grid size-10 place-items-center rounded-full bg-brand text-paper transition group-hover:-rotate-45 group-hover:bg-paper group-hover:text-brand">
                  <ArrowRight className="size-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

// ───────────── Product sections ─────────────

function ProductSection({
  id,
  eyebrow,
  title,
  products,
  loading,
  error,
  action,
  note,
  priority,
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  products: ProductCardDTO[] | undefined;
  loading?: boolean;
  error?: boolean;
  action?: React.ReactNode;
  note?: string;
  priority?: boolean;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="bg-card/60 py-20 md:py-28">
      <Container>
        <SectionHead id={`${id}-title`} eyebrow={eyebrow} title={title} action={action} {...(note ? { note } : {})} />
        {error ? (
          <Alert tone="info" title="Products are taking a moment to load">
            Please refresh the page in a little while, or visit us on Instagram for the latest drops.
          </Alert>
        ) : !loading && products && products.length === 0 ? (
          <p className="text-muted-foreground">New styles are on their way — check back soon.</p>
        ) : (
          <ProductGrid products={products} loading={loading ?? false} priorityCount={priority ? 4 : 0} />
        )}
      </Container>
    </section>
  );
}

function Campaign({
  image,
  alt,
  eyebrow,
  title,
  body,
  cta,
  products,
  reverse,
}: {
  image: string;
  alt: string;
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  cta: { label: string; to: "/kids" | "/women" };
  products: ProductCardDTO[] | undefined;
  reverse?: boolean;
}) {
  return (
    <section className="bg-ink text-paper">
      <div className="grid lg:grid-cols-2">
        <div className={cn("relative min-h-[460px] overflow-hidden", reverse && "lg:order-2")}>
          <img src={image} alt={alt} loading="lazy" width={1400} height={1750} className="absolute inset-0 h-full w-full object-cover" />
        </div>
        <div className="reveal flex flex-col justify-center px-6 py-16 md:px-16 lg:py-24">
          <Eyebrow className="text-brand-bright">{eyebrow}</Eyebrow>
          <h2 className="display mt-5 text-6xl md:text-8xl">{title}</h2>
          <p className="mt-6 max-w-md text-paper/70 md:text-lg">{body}</p>
          <div className="mt-8">
            <ButtonLink to={cta.to}>
              {cta.label} <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
          {products && products.length > 0 && (
            <ul className="mt-10 grid grid-cols-4 gap-2">
              {products.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <Link to="/products/$slug" params={{ slug: p.slug }} className="group block" aria-label={p.name}>
                    <div className="aspect-[4/5] overflow-hidden bg-paper/10">
                      {p.image && <img src={imageAt(p.image.url, 300)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                    </div>
                    <p className="mt-2 truncate text-xs text-paper/70">{formatINR(p.pricePaise)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Collections({ categories }: { categories: CategoryDTO[] }) {
  if (!categories.length) return null;
  return (
    <section aria-labelledby="trending-title" className="py-20 md:py-28">
      <Container>
        <SectionHead id="trending-title" eyebrow="Trending collections" title="What's hot right now" />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => (
            <li key={c.id} className="reveal">
              <Link to={c.department === "KIDS" ? "/kids" : "/women"} search={{ category: c.slug }} className="group flex h-full items-end justify-between gap-4 border-2 border-ink p-6 transition-colors hover:bg-ink hover:text-paper">
                <span>
                  <span className="eyebrow block text-brand">{c.department === "KIDS" ? "Kids" : "Women"}</span>
                  <span className="display mt-3 block text-4xl">{c.name}</span>
                  <span className="mt-2 block text-sm text-muted-foreground group-hover:text-paper/70">
                    {c.productCount} style{c.productCount === 1 ? "" : "s"}
                  </span>
                </span>
                <ArrowRight className="size-5 shrink-0 transition-transform group-hover:-rotate-45" />
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Testimonials({ items }: { items: HomeData["testimonials"] }) {
  return (
    <section aria-labelledby="reviews-title" className="py-20 md:py-28">
      <Container>
        <SectionHead id="reviews-title" eyebrow="Verified reviews" title="Loved by our customers" note="Reviews from customers who received their order." />
        <ul className="grid gap-5 md:grid-cols-3">
          {items.slice(0, 6).map((t) => (
            <li key={t.id} className="reveal border p-6">
              <p className="text-brand" aria-label={`${t.rating} out of 5 stars`}>
                {"★".repeat(t.rating)}
                <span className="text-muted">{"★".repeat(5 - t.rating)}</span>
              </p>
              {t.title && <p className="mt-3 font-bold">{t.title}</p>}
              <p className="mt-2 text-muted-foreground">“{t.body}”</p>
              <p className="mt-4 text-sm font-semibold">
                {t.authorName} ·{" "}
                <Link to="/products/$slug" params={{ slug: t.product.slug }} className="text-brand hover:underline">
                  {t.product.name}
                </Link>
              </p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

// ───────────── Brand trust ─────────────

function WhyAelitez() {
  const config = useConfig();
  const methods = useShippingMethods();
  const list = methods.data ?? [];
  // The full range across delivery options — never just the fastest, which would overstate speed.
  const range = list.length ? { min: Math.min(...list.map((m) => m.minDays)), max: Math.max(...list.map((m) => m.maxDays)) } : null;
  const items = [
    { icon: Star, title: "Best quality & price", body: "Trend-led fits and fabrics chosen to feel premium — priced for every day." },
    ...(range ? [{ icon: Truck, title: "Delivery across India", body: `Courier delivery, typically ${range.min}–${range.max} business days depending on the option you choose.` }] : []),
    ...(config.data ? [{ icon: RotateCcw, title: `${config.data.returnWindowDays}-day returns`, body: "Changed your mind? Request a return from your account after delivery." }] : []),
    ...(config.data?.payments.razorpay.enabled ? [{ icon: ShieldCheck, title: "Secure payments", body: "Pay through Razorpay — we never see or store your card details." }] : []),
    { icon: Store, title: "4 stores strong", body: "Shop online or visit us in Tiruppur — next franchise loading." },
  ];
  return (
    <section aria-labelledby="why-title" className="border-t py-20 md:py-28">
      <Container>
        <SectionHead id="why-title" eyebrow="Why AELITEZ" title={<>Premium <span className="text-brand">for less.</span></>} />
        <ul className={cn("grid gap-8 sm:grid-cols-2", items.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
          {items.map(({ icon: Icon, title, body }) => (
            <li key={title} className="reveal">
              <Icon className="size-7 text-brand" aria-hidden />
              <p className="mt-4 text-lg font-bold">{title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-xs text-muted-foreground">Customer numbers and ratings are as shared by AELITEZ CLOTHINGS.</p>
      </Container>
    </section>
  );
}

const IG_IMAGES = [heroWomen, tileGirls, campaignWomen, tileBoys, heroKids, tileBaby];

function InstagramGrid() {
  return (
    <section aria-labelledby="ig-title" className="border-t py-20 md:py-28">
      <Container>
        <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center md:gap-7">
            <Logo alt="" className="size-16 sm:size-20 md:size-28" />
            <div>
              <Eyebrow className="mb-4">On the gram</Eyebrow>
              <h2 id="ig-title" className="display text-[2.4rem] sm:text-5xl md:text-7xl">
                Follow {BRAND.instagramHandle}
              </h2>
            </div>
          </div>
          <a href={BRAND.instagramUrl} {...external} className="inline-flex items-center gap-2 self-start rounded-full bg-ink px-6 py-3.5 text-sm font-bold text-paper transition-colors hover:bg-brand md:self-auto">
            <Instagram className="size-4" /> Follow on Instagram
          </a>
        </div>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {IG_IMAGES.map((src, i) => (
            <a key={src} href={BRAND.instagramUrl} {...external} aria-label={`View AELITEZ on Instagram (opens in a new tab), image ${i + 1}`} className="group relative aspect-square overflow-hidden bg-card">
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
              <span className="absolute inset-0 grid place-items-center bg-ink/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Instagram className="size-7 text-paper" aria-hidden />
              </span>
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}

function StoreVisit() {
  return (
    <section id="stores" className="bg-brand text-paper">
      <Container className="grid gap-10 py-20 md:py-28 lg:grid-cols-2">
        <div className="reveal">
          <Eyebrow className="mb-5 text-paper/85">Visit the store</Eyebrow>
          <h2 className="display text-6xl md:text-8xl">
            See it. Try it.
            <br />
            Love it.
          </h2>
          <p className="mt-6 max-w-md text-lg">Come try on the latest drops at our Tiruppur store — 4 stores strong, with the next franchise loading.</p>
        </div>
        <div className="reveal flex flex-col justify-end gap-6 border-t-2 border-paper/40 pt-8 lg:border-l-2 lg:border-t-0 lg:pl-12 lg:pt-0">
          <address className="flex gap-4 text-2xl font-semibold not-italic leading-snug md:text-3xl">
            <MapPin className="mt-1 size-7 shrink-0" aria-hidden />
            {BRAND.storeAddress}
          </address>
          <div className="flex flex-wrap gap-3">
            <a href={DIRECTIONS_URL} {...external} className="inline-flex items-center gap-2 rounded-full bg-paper px-6 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-ink hover:text-paper">
              <Navigation className="size-4" /> Get directions
            </a>
            <a href={MAPS_URL} {...external} className="inline-flex items-center gap-2 rounded-full border-2 border-current px-6 py-3.5 text-sm font-bold transition-colors hover:border-ink hover:bg-ink">
              <MapPin className="size-4" /> View on Google Maps
            </a>
            <a href={BRAND.instagramUrl} {...external} className="inline-flex items-center gap-2 rounded-full border-2 border-current px-6 py-3.5 text-sm font-bold transition-colors hover:border-ink hover:bg-ink">
              <Instagram className="size-4" /> Message on Instagram
            </a>
          </div>
          <p className="text-sm">For store timings and enquiries, please message us on Instagram.</p>
        </div>
      </Container>
    </section>
  );
}

function Newsletter() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = newsletterSchema.safeParse({ email, consent, source: "homepage" });
    if (!parsed.success) return setState({ tone: "error", text: parsed.error.issues[0]?.message ?? "Please check your details." });
    setBusy(true);
    try {
      await api("/newsletter", { method: "POST", body: parsed.data });
      setState({ tone: "success", text: "You're on the list — look out for new drops and offers in your inbox." });
      setEmail("");
      setConsent(false);
    } catch (err) {
      setState({ tone: "error", text: isApiError(err) ? err.message : "Couldn't sign you up. Please try again." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="nl-title" className="py-20 md:py-28">
      <Container className="reveal grid gap-10 lg:grid-cols-2 lg:items-end">
        <div>
          <Eyebrow className="mb-4">Stay in the loop</Eyebrow>
          <h2 id="nl-title" className="display text-6xl md:text-8xl">
            First look at <span className="text-brand">new drops</span>
          </h2>
        </div>
        <form method="post" onSubmit={submit} noValidate>
          <label htmlFor="nl-email" className="sr-only">
            Email address
          </label>
          <div className="flex border-b-2 border-ink transition-colors focus-within:border-brand">
            <input id="nl-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" className="w-full bg-transparent py-4 text-lg outline-none" />
            <Button type="submit" variant="ghost" loading={busy} className="shrink-0 whitespace-nowrap px-2 text-brand hover:bg-transparent hover:text-brand-deep">
              Sign up <ArrowRight className="size-4" />
            </Button>
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm text-muted-foreground">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-brand" />
            I agree to receive emails from AELITEZ CLOTHINGS about new arrivals and offers. I can unsubscribe at any time.
          </label>
          {state && (
            <p role="status" className={cn("mt-4 text-sm font-semibold", state.tone === "error" ? "text-brand" : "text-ink")}>
              {state.text}
            </p>
          )}
        </form>
      </Container>
    </section>
  );
}
