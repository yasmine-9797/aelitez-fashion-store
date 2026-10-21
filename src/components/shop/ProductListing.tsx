import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AGE_BANDS, DISCOUNT_FILTERS, SORT_OPTIONS, type AgeBand, type Department, type SortKey } from "@shared/catalog";
import type { CategoryDTO, ProductListDTO } from "@shared/types";
import { formatINR } from "@shared/money";
import { Overlay } from "@/components/shop/Overlay";
import { ProductGrid } from "@/components/shop/ProductCard";
import { Alert, Button, Container, EmptyState, Eyebrow } from "@/components/shop/ui";
import { isApiError } from "@/lib/api";
import { useCategories, useProducts } from "@/lib/queries";
import { activeFilterCount, splitCsv, toApiQuery, type ShopSearch } from "@/lib/shop-search";
import { cn } from "@/lib/utils";

type ListingPath = "/shop" | "/kids" | "/women";

const flat = (cats: CategoryDTO[]): CategoryDTO[] => cats.flatMap((c) => [c, ...flat(c.children)]);

export function ProductListing({
  path,
  search,
  department,
  eyebrow,
  title,
  intro,
  initialData,
}: {
  path: ListingPath;
  search: ShopSearch;
  department?: Department;
  eyebrow: string;
  title: string;
  intro: string;
  initialData?: ProductListDTO | null;
}) {
  const navigate = useNavigate({ from: path });
  const query = toApiQuery(search, department);
  const products = useProducts(query, initialData);
  const data = products.data ?? initialData ?? undefined;
  const categories = useCategories(department);
  const allCats = flat(categories.data ?? []);
  const current = search.category ? allCats.find((c) => c.slug === search.category) : undefined;
  const [filtersOpen, setFiltersOpen] = useState(false);

  const update = (patch: Partial<ShopSearch>) => void navigate({ search: (prev: ShopSearch) => ({ ...prev, ...patch, page: undefined }), resetScroll: false });
  const filters = activeFilterCount(search);
  const total = data?.meta.total ?? 0;

  const panel = <FilterPanel search={search} department={department} data={data} categories={categories.data ?? []} update={update} />;

  return (
    <div>
      <section className="border-b bg-card/60">
        <Container className="py-10 md:py-14">
          <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link to="/" className="hover:text-brand">
                  Home
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>{current ? <Link to={path} className="hover:text-brand">{title}</Link> : <span aria-current="page">{title}</span>}</li>
              {current && (
                <>
                  <li aria-hidden>/</li>
                  <li aria-current="page">{current.name}</li>
                </>
              )}
            </ol>
          </nav>
          <Eyebrow className="mb-4">{eyebrow}</Eyebrow>
          <h1 className="display text-6xl md:text-8xl">{search.q ? <>Results for “{search.q}”</> : current?.name ?? title}</h1>
          <p className="mt-4 max-w-2xl text-muted-foreground md:text-lg">{current?.description ?? intro}</p>
        </Container>
      </section>

      <Container className="py-10 md:py-14">
        <div className="grid gap-10 lg:grid-cols-12">
          <aside className="hidden lg:col-span-3 lg:block" aria-label="Filters">
            {panel}
          </aside>
          <div className="lg:col-span-9">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm font-semibold" aria-live="polite">
                {products.isFetching && !data ? "Loading styles…" : `${total} style${total === 1 ? "" : "s"}`}
              </p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setFiltersOpen(true)} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold hover:border-ink lg:hidden">
                  <SlidersHorizontal className="size-4" /> Filters{filters ? ` (${filters})` : ""}
                </button>
                <label htmlFor="sort" className="sr-only sm:not-sr-only sm:text-sm sm:font-semibold">
                  Sort
                </label>
                <select id="sort" value={search.sort ?? "newest"} onChange={(e) => update({ sort: e.target.value as SortKey })} className="rounded-full border bg-paper px-4 py-2 text-sm font-semibold">
                  {(Object.entries(SORT_OPTIONS) as [SortKey, string][])
                    // "Most popular" needs real sales data to mean anything.
                    .filter(([key]) => key !== "popular" || data?.facets.hasSalesData)
                    .map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <ActiveChips search={search} categories={allCats} update={update} clear={() => void navigate({ search: search.q ? { q: search.q } : {} })} />

            {products.isError && !data ? (
              <Alert tone="error" title="We couldn't load products">
                {isApiError(products.error) ? products.error.message : "Please try again in a moment."}
              </Alert>
            ) : data && data.items.length === 0 ? (
              <EmptyState
                title="No matches"
                body={filters ? "Try removing a filter or two — or browse the full collection." : "New styles are on their way. Check back soon."}
                action={
                  filters ? (
                    <Button variant="outline" onClick={() => void navigate({ search: {} })}>
                      Clear all filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className={cn("transition-opacity", products.isFetching && data && "opacity-60")}>
                <ProductGrid products={data?.items} loading={!data} skeletons={12} priorityCount={4} />
              </div>
            )}

            {data && data.meta.totalPages > 1 && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} pageSize={data.meta.pageSize} total={total} path={path} search={search} />}
          </div>
        </div>
      </Container>

      <Overlay open={filtersOpen} onClose={() => setFiltersOpen(false)} label="Filters" side="left" className="flex flex-col">
        <div className="border-b p-6 pr-16">
          <h2 className="display text-4xl">Filters</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{panel}</div>
        <div className="border-t p-6">
          <Button className="w-full" onClick={() => setFiltersOpen(false)}>
            Show {total} style{total === 1 ? "" : "s"}
          </Button>
        </div>
      </Overlay>
    </div>
  );
}

// ───────────── Filters ─────────────

function FilterGroup({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b py-5">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold uppercase tracking-widest">
        {title}
        <span aria-hidden className="text-lg leading-none group-open:rotate-45 transition-transform">
          +
        </span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function toggleCsv(current: string | undefined, value: string) {
  const list = splitCsv(current);
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return next.length ? next.join(",") : undefined;
}

function FilterPanel({ search, department, data, categories, update }: { search: ShopSearch; department: Department | undefined; data: ProductListDTO | undefined; categories: CategoryDTO[]; update: (p: Partial<ShopSearch>) => void }) {
  const sizes = splitCsv(search.sizes);
  const colors = splitCsv(search.colors);
  return (
    <div>
      {categories.length > 0 && (
        <FilterGroup title="Category">
          <ul className="space-y-2 text-sm">
            {categories.map((c) => (
              <li key={c.id}>
                <CategoryOption cat={c} selected={search.category} onSelect={(slug) => update({ category: slug === search.category ? undefined : slug })} />
                {c.children.length > 0 && (
                  <ul className="ml-4 mt-2 space-y-2 border-l pl-3">
                    {c.children.map((ch) => (
                      <li key={ch.id}>
                        <CategoryOption cat={ch} selected={search.category} onSelect={(slug) => update({ category: slug === search.category ? undefined : slug })} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </FilterGroup>
      )}

      {department !== "WOMEN" && (
        <FilterGroup title="Age" defaultOpen={department === "KIDS"}>
          <ul className="space-y-2 text-sm">
            {(Object.keys(AGE_BANDS) as AgeBand[]).map((age) => (
              <li key={age}>
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="radio" name="age" checked={search.age === age} onChange={() => update({ age })} onClick={() => search.age === age && update({ age: undefined })} className="size-4 accent-brand" />
                  {AGE_BANDS[age].label}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Based on the age guidance given for each product — check the size guide for fit.</p>
        </FilterGroup>
      )}

      {data && data.facets.sizes.length > 0 && (
        <FilterGroup title="Size">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sizes">
            {data.facets.sizes.map((s) => (
              <button
                key={s.label}
                type="button"
                aria-pressed={sizes.includes(s.label)}
                onClick={() => update({ sizes: toggleCsv(search.sizes, s.label) })}
                className={cn("min-w-12 border px-3 py-2 text-sm font-semibold transition-colors", sizes.includes(s.label) ? "border-ink bg-ink text-paper" : "hover:border-ink")}
              >
                {s.label}
              </button>
            ))}
          </div>
        </FilterGroup>
      )}

      {data && data.facets.colors.length > 0 && (
        <FilterGroup title="Colour">
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {data.facets.colors.map((c) => (
              <li key={c.name}>
                <button type="button" aria-pressed={colors.includes(c.name)} onClick={() => update({ colors: toggleCsv(search.colors, c.name) })} className={cn("flex w-full items-center gap-2 rounded-full border px-2 py-1.5 text-left", colors.includes(c.name) ? "border-ink" : "border-transparent hover:border-border")}>
                  <span className="size-5 shrink-0 rounded-full border" style={{ backgroundColor: c.hex }} aria-hidden />
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </FilterGroup>
      )}

      <FilterGroup title="Price">
        <PriceFilter search={search} range={data?.facets.priceRange ?? null} update={update} />
      </FilterGroup>

      <FilterGroup title="Availability">
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={Boolean(search.inStock)} onChange={(e) => update({ inStock: e.target.checked || undefined })} className="size-4 accent-brand" />
          In stock only
        </label>
      </FilterGroup>

      <FilterGroup title="Discount" defaultOpen={false}>
        <ul className="space-y-2 text-sm">
          {DISCOUNT_FILTERS.map((d) => (
            <li key={d}>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="radio" name="discount" checked={search.minDiscount === d} onChange={() => update({ minDiscount: d })} onClick={() => search.minDiscount === d && update({ minDiscount: undefined })} className="size-4 accent-brand" />
                {d}% off or more
              </label>
            </li>
          ))}
        </ul>
      </FilterGroup>
    </div>
  );
}

function CategoryOption({ cat, selected, onSelect }: { cat: CategoryDTO; selected: string | undefined; onSelect: (slug: string) => void }) {
  const active = selected === cat.slug;
  return (
    <button type="button" aria-pressed={active} onClick={() => onSelect(cat.slug)} className={cn("flex w-full justify-between gap-2 text-left hover:text-brand", active && "font-bold text-brand")}>
      <span>{cat.name}</span>
      <span className="text-muted-foreground">{cat.productCount}</span>
    </button>
  );
}

function PriceFilter({ search, range, update }: { search: ShopSearch; range: { minPaise: number; maxPaise: number } | null; update: (p: Partial<ShopSearch>) => void }) {
  const [min, setMin] = useState(search.minPrice?.toString() ?? "");
  const [max, setMax] = useState(search.maxPrice?.toString() ?? "");
  useEffect(() => {
    setMin(search.minPrice?.toString() ?? "");
    setMax(search.maxPrice?.toString() ?? "");
  }, [search.minPrice, search.maxPrice]);
  const apply = (e: FormEvent) => {
    e.preventDefault();
    const lo = min ? Math.max(0, Math.floor(Number(min))) : undefined;
    const hi = max ? Math.max(0, Math.floor(Number(max))) : undefined;
    update({ minPrice: Number.isFinite(lo) ? lo : undefined, maxPrice: Number.isFinite(hi) ? hi : undefined });
  };
  return (
    <form onSubmit={apply} className="space-y-3">
      {range && (
        <p className="text-xs text-muted-foreground">
          {formatINR(range.minPaise)} – {formatINR(range.maxPaise)}
        </p>
      )}
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="price-min">
          Minimum price in rupees
        </label>
        <input id="price-min" inputMode="numeric" pattern="[0-9]*" placeholder="Min ₹" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} className="w-full border px-3 py-2 text-sm" />
        <span aria-hidden>–</span>
        <label className="sr-only" htmlFor="price-max">
          Maximum price in rupees
        </label>
        <input id="price-max" inputMode="numeric" pattern="[0-9]*" placeholder="Max ₹" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} className="w-full border px-3 py-2 text-sm" />
      </div>
      <Button type="submit" variant="outline" size="sm">
        Apply
      </Button>
    </form>
  );
}

function ActiveChips({ search, categories, update, clear }: { search: ShopSearch; categories: CategoryDTO[]; update: (p: Partial<ShopSearch>) => void; clear: () => void }) {
  const chips: { label: string; remove: () => void }[] = [];
  if (search.category) chips.push({ label: categories.find((c) => c.slug === search.category)?.name ?? search.category, remove: () => update({ category: undefined }) });
  if (search.age) chips.push({ label: AGE_BANDS[search.age].label, remove: () => update({ age: undefined }) });
  for (const s of splitCsv(search.sizes)) chips.push({ label: `Size ${s}`, remove: () => update({ sizes: toggleCsv(search.sizes, s) }) });
  for (const c of splitCsv(search.colors)) chips.push({ label: c, remove: () => update({ colors: toggleCsv(search.colors, c) }) });
  if (search.minPrice != null || search.maxPrice != null) chips.push({ label: `₹${search.minPrice ?? 0} – ${search.maxPrice != null ? `₹${search.maxPrice}` : "any"}`, remove: () => update({ minPrice: undefined, maxPrice: undefined }) });
  if (search.inStock) chips.push({ label: "In stock", remove: () => update({ inStock: undefined }) });
  if (search.minDiscount) chips.push({ label: `${search.minDiscount}%+ off`, remove: () => update({ minDiscount: undefined }) });
  if (!chips.length) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button key={c.label} type="button" onClick={c.remove} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-paper hover:bg-brand" aria-label={`Remove filter: ${c.label}`}>
          {c.label} <X className="size-3" aria-hidden />
        </button>
      ))}
      <button type="button" onClick={clear} className="ml-1 text-xs font-bold text-brand underline underline-offset-4">
        Clear all
      </button>
    </div>
  );
}

function Pagination({ page, totalPages, pageSize, total, path, search }: { page: number; totalPages: number; pageSize: number; total: number; path: ListingPath; search: ShopSearch }) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="mt-14 flex flex-col items-center gap-4">
      <p className="text-sm text-muted-foreground">
        Showing {from}–{to} of {total}
      </p>
      <ul className="flex items-center gap-1">
        <li>
          <Link to={path} search={{ ...search, page: page > 2 ? page - 1 : undefined }} aria-label="Previous page" disabled={page === 1} className={cn("grid size-10 place-items-center rounded-full border", page === 1 ? "pointer-events-none opacity-40" : "hover:border-ink")}>
            <ChevronLeft className="size-4" />
          </Link>
        </li>
        {pages.map((p, i) => (
          <li key={p} className="flex items-center gap-1">
            {i > 0 && p - (pages[i - 1] ?? p) > 1 && <span className="px-1 text-muted-foreground">…</span>}
            <Link to={path} search={{ ...search, page: p === 1 ? undefined : p }} aria-current={p === page ? "page" : undefined} className={cn("grid size-10 place-items-center rounded-full text-sm font-bold", p === page ? "bg-ink text-paper" : "hover:bg-muted")}>
              {p}
            </Link>
          </li>
        ))}
        <li>
          <Link to={path} search={{ ...search, page: page + 1 }} aria-label="Next page" disabled={page === totalPages} className={cn("grid size-10 place-items-center rounded-full border", page === totalPages ? "pointer-events-none opacity-40" : "hover:border-ink")}>
            <ChevronRight className="size-4" />
          </Link>
        </li>
      </ul>
    </nav>
  );
}
