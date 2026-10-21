import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Heart, Ruler, ShieldCheck, Truck, ZoomIn } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { DEPARTMENT_LABEL, DEPARTMENT_PATH, formatAgeRange } from "@shared/catalog";
import { formatINR } from "@shared/money";
import type { ProductDetailDTO, VariantDTO } from "@shared/types";
import { openBag } from "@/components/layout/SiteHeader";
import { Overlay } from "@/components/shop/Overlay";
import { Price } from "@/components/shop/Price";
import { ProductGrid, useWishlistToggle } from "@/components/shop/ProductCard";
import { ProductReviews } from "@/components/shop/ProductReviews";
import { SmartImage } from "@/components/shop/SmartImage";
import { Button, Container, QtyStepper, SectionHead } from "@/components/shop/ui";
import { isApiError } from "@/lib/api";
import { imageAt } from "@/lib/images";
import { fetchProduct, qk, useAddToCart, useLookup, useProduct, useRelated, useShippingMethods } from "@/lib/queries";
import { useRecentlyViewed } from "@/lib/recently-viewed";
import { absoluteUrl, pageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_store/products/$slug")({
  loader: async ({ params, context }) => {
    try {
      return await context.queryClient.ensureQueryData({ queryKey: qk.product(params.slug), queryFn: () => fetchProduct(params.slug) });
    } catch (err) {
      if (isApiError(err) && err.status === 404) throw notFound();
      throw err;
    }
  },
  head: ({ loaderData: p }) => {
    if (!p) return {};
    const path = `/products/${p.slug}`;
    const image = p.images[0] ? imageAt(p.images[0].url, 1200) : undefined;
    const inStock = p.variants.some((v) => v.available > 0);
    const prices = p.variants.map((v) => v.pricePaise / 100);
    const head = pageHead({ title: `${p.name} — ${DEPARTMENT_LABEL[p.department]}`, description: p.description.slice(0, 155), path, image, type: "product" });
    return {
      ...head,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.name,
            description: p.description,
            image: p.images.map((i) => imageAt(i.url, 1200)),
            sku: p.variants[0]?.sku,
            brand: { "@type": "Brand", name: "AELITEZ CLOTHINGS" },
            ...(p.ratingAvg != null && p.ratingCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.ratingAvg, reviewCount: p.ratingCount } } : {}),
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "INR",
              lowPrice: prices.length ? Math.min(...prices) : p.pricePaise / 100,
              highPrice: prices.length ? Math.max(...prices) : p.pricePaise / 100,
              offerCount: p.variants.length,
              availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              url: absoluteUrl(path),
            },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
              { "@type": "ListItem", position: 2, name: DEPARTMENT_LABEL[p.department], item: absoluteUrl(DEPARTMENT_PATH[p.department]) },
              { "@type": "ListItem", position: 3, name: p.name, item: absoluteUrl(path) },
            ],
          }),
        },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const loaded = Route.useLoaderData();
  const product = useProduct(loaded.slug, loaded);
  const p = product.data ?? loaded;
  const { record, slugs } = useRecentlyViewed(p.slug);
  useEffect(() => record(p.slug), [p.slug, record]);

  return (
    <>
      <Container className="py-8 md:py-12">
        <Breadcrumbs p={p} />
        <div className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <Gallery p={p} />
          </div>
          <div className="lg:col-span-5">
            <BuyBox p={p} />
          </div>
        </div>
      </Container>
      <ProductReviews slug={p.slug} />
      <Related slug={p.slug} />
      <RecentlyViewed slugs={slugs} />
    </>
  );
}

function Breadcrumbs({ p }: { p: ProductDetailDTO }) {
  const category = p.categories[0];
  const deptPath = DEPARTMENT_PATH[p.department] as "/kids" | "/women";
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link to="/" className="hover:text-brand">
            Home
          </Link>
        </li>
        <li aria-hidden>/</li>
        <li>
          <Link to={deptPath} className="hover:text-brand">
            {DEPARTMENT_LABEL[p.department]}
          </Link>
        </li>
        {category && (
          <>
            <li aria-hidden>/</li>
            <li>
              <Link to={deptPath} search={{ category: category.slug }} className="hover:text-brand">
                {category.name}
              </Link>
            </li>
          </>
        )}
        <li aria-hidden>/</li>
        <li aria-current="page" className="text-ink">
          {p.name}
        </li>
      </ol>
    </nav>
  );
}

// ───────────── Gallery ─────────────

function Gallery({ p }: { p: ProductDetailDTO }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const images = p.images.length ? p.images : [];
  const current = images[Math.min(index, images.length - 1)];
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };
  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      {images.length > 1 && (
        <ul className="flex gap-2 md:flex-col" aria-label="Product images">
          {images.map((img, i) => (
            <li key={img.url}>
              <button type="button" onClick={() => setIndex(i)} aria-label={`Show image ${i + 1}`} aria-current={i === index} className={cn("block w-16 border-2 md:w-20", i === index ? "border-ink" : "border-transparent")}>
                <SmartImage src={img.url} alt="" width={160} sizes="80px" className="aspect-[4/5] w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative flex-1">
        {current ? (
          <div
            className="group relative aspect-[4/5] cursor-zoom-in overflow-hidden bg-card"
            onMouseMove={onMove}
            onMouseLeave={() => setZoom(null)}
            onClick={() => setLightbox(true)}
            role="button"
            tabIndex={0}
            aria-label="Open full-size image"
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setLightbox(true)}
          >
            <SmartImage
              src={current.url}
              alt={current.alt}
              width={1200}
              sizes="(min-width: 1024px) 50vw, 100vw"
              fetchPriority="high"
              className="h-full w-full object-cover transition-transform duration-200"
              style={zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            />
            <span className="pointer-events-none absolute bottom-4 right-4 grid size-10 place-items-center rounded-full bg-paper/90 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
              <ZoomIn className="size-5" />
            </span>
          </div>
        ) : (
          <SmartImage src="" alt={p.name} className="aspect-[4/5] w-full" />
        )}
      </div>
      {current && (
        <Overlay open={lightbox} onClose={() => setLightbox(false)} label={`${p.name} — image ${index + 1}`} side="center" className="max-w-3xl bg-paper">
          <SmartImage src={current.url} alt={current.alt} width={1200} sizes="90vw" className="h-auto w-full" />
        </Overlay>
      )}
    </div>
  );
}

// ───────────── Buy box ─────────────

function BuyBox({ p }: { p: ProductDetailDTO }) {
  const colors = useMemo(() => {
    const map = new Map<string, VariantDTO["color"]>();
    for (const v of p.variants) map.set(v.color.id, v.color);
    return [...map.values()];
  }, [p.variants]);
  const firstInStock = p.variants.find((v) => v.available > 0) ?? p.variants[0];
  const [colorId, setColorId] = useState(firstInStock?.color.id ?? "");
  const sizes = p.variants.filter((v) => v.color.id === colorId);
  const [variantId, setVariantId] = useState<string | null>(sizes.length === 1 && sizes[0]!.available > 0 ? sizes[0]!.id : null);
  const variant = p.variants.find((v) => v.id === variantId) ?? null;
  const [qty, setQty] = useState(1);
  const [guide, setGuide] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const add = useAddToCart();
  const { saved, onToggle } = useWishlistToggle();
  const shipping = useShippingMethods();
  const anyStock = p.variants.some((v) => v.available > 0);
  const ageText = formatAgeRange(p.ageMinMonths, p.ageMaxMonths);
  const price = variant?.pricePaise ?? p.pricePaise;

  useEffect(() => setQty(1), [variantId]);

  const addToBag = () => {
    if (!variant) {
      setSizeError(true);
      document.getElementById("size-options")?.focus();
      return;
    }
    add.mutate(
      { variantId: variant.id, quantity: qty },
      {
        onSuccess: () => {
          toast.success(`${p.name} added to your bag`, { description: `${variant.color.name} · Size ${variant.size.label} · Qty ${qty}`, action: { label: "View bag", onClick: openBag } });
          openBag();
        },
        onError: (e) => toast.error(isApiError(e) ? e.message : "Couldn't add to your bag. Please try again."),
      },
    );
  };

  return (
    <div className="lg:sticky lg:top-28">
      <p className="eyebrow text-brand">{p.categories.map((c) => c.name).slice(0, 2).join(" · ") || DEPARTMENT_LABEL[p.department]}</p>
      <h1 className="display mt-3 text-5xl md:text-6xl">{p.name}</h1>
      {p.ratingAvg != null && p.ratingCount > 0 && (
        <a href="#reviews" className="mt-3 inline-block text-sm hover:underline">
          <span className="text-brand">{"★".repeat(Math.round(p.ratingAvg))}</span> {p.ratingAvg.toFixed(1)} · {p.ratingCount} verified review{p.ratingCount === 1 ? "" : "s"}
        </a>
      )}
      <Price pricePaise={price} compareAtPaise={variant?.pricePaise != null && variant.pricePaise !== p.pricePaise ? null : p.compareAtPaise} size="lg" className="mt-4" />
      <p className="mt-1 text-xs text-muted-foreground">Inclusive of all taxes</p>
      {ageText && <p className="mt-4 text-sm"><span className="font-semibold">Age guidance:</span> {ageText}</p>}

      <fieldset className="mt-6">
        <legend className="mb-2 text-sm font-bold">
          Colour: <span className="font-normal">{colors.find((c) => c.id === colorId)?.name}</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setColorId(c.id);
                setVariantId(null);
              }}
              aria-pressed={colorId === c.id}
              aria-label={c.name}
              title={c.name}
              className={cn("size-9 rounded-full border-2 ring-offset-2 ring-offset-paper", colorId === c.id ? "ring-2 ring-ink" : "")}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <legend className="text-sm font-bold">Size{variant && <span className="font-normal">: {variant.size.label}</span>}</legend>
          <button type="button" onClick={() => setGuide(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold underline underline-offset-4 hover:text-brand">
            <Ruler className="size-4" /> Size guide
          </button>
        </div>
        <div id="size-options" tabIndex={-1} className="flex flex-wrap gap-2" role="group" aria-describedby={sizeError ? "size-error" : undefined}>
          {sizes.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={v.available === 0}
              onClick={() => {
                setVariantId(v.id);
                setSizeError(false);
              }}
              aria-pressed={variantId === v.id}
              aria-label={`Size ${v.size.label}${v.available === 0 ? ", sold out" : v.lowStock ? `, only ${v.available} left` : ""}`}
              className={cn(
                "relative min-w-14 border px-3 py-2.5 text-sm font-semibold transition-colors",
                variantId === v.id ? "border-ink bg-ink text-paper" : "hover:border-ink",
                v.available === 0 && "cursor-not-allowed text-muted-foreground line-through opacity-60 hover:border-border",
              )}
            >
              {v.size.label}
            </button>
          ))}
        </div>
        {sizeError && (
          <p id="size-error" className="mt-2 text-sm font-semibold text-brand">
            Please choose a size.
          </p>
        )}
        <p className="mt-2 text-sm" aria-live="polite">
          {!anyStock ? (
            <span className="font-semibold text-brand">Sold out in all sizes</span>
          ) : variant ? (
            variant.lowStock ? <span className="font-semibold text-brand">Only {variant.available} left in this size</span> : <span className="text-muted-foreground">In stock</span>
          ) : null}
        </p>
      </fieldset>

      {anyStock && (
        <div className="mt-6 flex items-center gap-4">
          <span className="text-sm font-bold">Qty</span>
          <QtyStepper value={qty} onChange={(q) => setQty(Math.max(1, q))} max={Math.max(1, variant?.available ?? 1)} label={p.name} disabled={!variant} />
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Button size="lg" className="flex-1" onClick={addToBag} loading={add.isPending} disabled={!anyStock || (variant !== null && variant.available === 0)}>
          {anyStock ? `Add to bag — ${formatINR(price * qty)}` : "Sold out"}
        </Button>
        <button
          type="button"
          onClick={() => onToggle(p)}
          aria-pressed={saved.has(p.id)}
          aria-label={saved.has(p.id) ? "Remove from wishlist" : "Save to wishlist"}
          className={cn("grid size-14 shrink-0 place-items-center rounded-full border-2 transition-colors hover:border-brand hover:text-brand", saved.has(p.id) ? "border-brand text-brand" : "border-ink")}
        >
          <Heart className={cn("size-5", saved.has(p.id) && "fill-brand")} />
        </button>
      </div>

      {(shipping.data ?? []).length > 0 && (
        <div className="mt-8 space-y-3 border-t pt-6 text-sm">
          {(shipping.data ?? []).map((m) => (
            <p key={m.code} className="flex gap-3">
              <Truck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>
                <span className="font-semibold">{m.name}</span> — typically {m.minDays}–{m.maxDays} business days ·{" "}
                {m.feePaise === 0 ? "free" : `${formatINR(m.feePaise)}${m.freeAbovePaise != null ? `, free above ${formatINR(m.freeAbovePaise)}` : ""}`}
              </span>
            </p>
          ))}
          <p className="flex gap-3 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>Delivery times are estimates from the store's delivery settings and may vary by location.</span>
          </p>
        </div>
      )}

      <div className="mt-8 divide-y border-y">
        <Details title="Description" open>
          <p className="whitespace-pre-line">{p.description}</p>
        </Details>
        {(p.fabric || p.care) && (
          <Details title="Fabric & care">
            {p.fabric && (
              <p>
                <span className="font-semibold">Fabric:</span> {p.fabric}
              </p>
            )}
            {p.care && (
              <p className="mt-2">
                <span className="font-semibold">Care:</span> {p.care}
              </p>
            )}
          </Details>
        )}
        {p.specs.length > 0 && (
          <Details title="Specifications">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              {p.specs.map((s) => (
                <div key={s.label} className="contents">
                  <dt className="font-semibold">{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
              <dt className="font-semibold">SKU</dt>
              <dd>{variant?.sku ?? p.variants[0]?.sku}</dd>
            </dl>
          </Details>
        )}
      </div>

      <Overlay open={guide} onClose={() => setGuide(false)} label="Size guide" side="center" className="max-w-xl p-6 md:p-10">
        <h2 className="display text-4xl">Size guide</h2>
        <p className="mt-2 text-sm text-muted-foreground">Sizes available for {p.name}. Age guidance is supplied with the product and is a guide only — fit varies by child.</p>
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 font-bold">Size</th>
              <th className="py-2 font-bold">Guidance</th>
              <th className="py-2 font-bold">Availability</th>
            </tr>
          </thead>
          <tbody>
            {[...new Map(p.variants.map((v) => [v.size.id, v])).values()].map((v) => {
              const stock = p.variants.filter((x) => x.size.id === v.size.id).some((x) => x.available > 0);
              return (
                <tr key={v.size.id} className="border-b">
                  <td className="py-2 font-semibold">{v.size.label}</td>
                  <td className="py-2">{v.size.ageGuidance ?? (ageText && p.department === "KIDS" ? `Product suits ${ageText}` : "—")}</td>
                  <td className="py-2">{stock ? "In stock" : "Sold out"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-muted-foreground">Detailed body measurements will be added by the store. Unsure? Message us on Instagram before ordering.</p>
      </Overlay>
    </div>
  );
}

function Details({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold uppercase tracking-widest">
        {title}
        <span aria-hidden className="text-lg leading-none transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}

function Related({ slug }: { slug: string }) {
  const related = useRelated(slug);
  if (!related.data?.length) return null;
  return (
    <section aria-labelledby="related-title" className="bg-card/60 py-16 md:py-24">
      <Container>
        <SectionHead id="related-title" eyebrow="You may also like" title="Complete the look" />
        <ProductGrid products={related.data.slice(0, 4)} />
      </Container>
    </section>
  );
}

function RecentlyViewed({ slugs }: { slugs: string[] }) {
  const recent = useLookup(slugs.slice(0, 8));
  if (!recent.data?.length) return null;
  return (
    <section aria-labelledby="recent-title" className="py-16 md:py-24">
      <Container>
        <SectionHead id="recent-title" eyebrow="Picked up where you left off" title="Recently viewed" />
        <ProductGrid products={recent.data.slice(0, 4)} />
      </Container>
    </section>
  );
}
