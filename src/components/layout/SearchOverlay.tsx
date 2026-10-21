import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { formatINR } from "@shared/money";
import { DEPARTMENT_LABEL, type Department } from "@shared/catalog";
import { Overlay } from "@/components/shop/Overlay";
import { SmartImage } from "@/components/shop/SmartImage";
import { useSearch } from "@/lib/queries";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const term = useDebounced(q, 200);
  const results = useSearch(term);
  const navigate = useNavigate();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    onClose();
    void navigate({ to: "/shop", search: { q: q.trim() } });
  };
  const data = term.trim().length >= 2 ? results.data : undefined;
  return (
    <Overlay open={open} onClose={onClose} label="Search products" side="top" className="p-6 md:p-10">
      <form role="search" onSubmit={submit} className="mx-auto max-w-3xl">
        <label htmlFor="site-search" className="eyebrow text-brand">
          Search kids' &amp; women's fashion
        </label>
        <div className="mt-3 flex items-center gap-3 border-b-2 border-ink pb-2 pr-12 transition-colors focus-within:border-brand">
          <Search className="size-6 text-brand" aria-hidden />
          <input
            id="site-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Try “kurta”, “party frock”, “jeans”…"
            autoComplete="off"
            className="display w-full bg-transparent text-3xl outline-none placeholder:text-muted-foreground/50 md:text-5xl"
          />
        </div>
        <div className="mt-6 max-h-[55vh] overflow-y-auto" aria-live="polite">
          {data?.categories.length ? (
            <ul className="mb-4 flex flex-wrap gap-2">
              {data.categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    to={c.department === "KIDS" ? "/kids" : "/women"}
                    search={{ category: c.slug }}
                    onClick={onClose}
                    className="inline-block rounded-full border px-4 py-1.5 text-sm font-semibold hover:border-brand hover:text-brand"
                  >
                    {c.name} <span className="text-muted-foreground">· {DEPARTMENT_LABEL[c.department as Department]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {data?.products.length ? (
            <ul className="divide-y">
              {data.products.map((p) => (
                <li key={p.id}>
                  <Link to="/products/$slug" params={{ slug: p.slug }} onClick={onClose} className="flex items-center gap-4 py-3 hover:bg-muted">
                    {p.image ? <SmartImage src={p.image.url} alt="" width={120} sizes="56px" className="h-16 w-14 object-cover" /> : <div className="h-16 w-14 bg-card" />}
                    <span className="flex-1 font-semibold">{p.name}</span>
                    <span className="font-bold">{formatINR(p.pricePaise)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : term.trim().length >= 2 && !results.isFetching ? (
            <p className="text-sm text-muted-foreground">No matches yet — press Enter to search the full collection.</p>
          ) : null}
        </div>
        {q.trim() && (
          <button type="submit" className="mt-4 text-sm font-semibold text-brand underline underline-offset-4">
            See all results for “{q.trim()}”
          </button>
        )}
      </form>
    </Overlay>
  );
}
