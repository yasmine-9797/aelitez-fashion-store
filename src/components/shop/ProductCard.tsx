import { Link, useNavigate } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import type { ProductCardDTO } from "@shared/types";
import { isApiError } from "@/lib/api";
import { useMe, useToggleWishlist, useWishlist } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Price } from "./Price";
import { SmartImage } from "./SmartImage";
import { Skeleton } from "./ui";

export function useWishlistToggle() {
  const me = useMe();
  const signedIn = Boolean(me.data);
  const wishlist = useWishlist(signedIn);
  const toggle = useToggleWishlist();
  const navigate = useNavigate();
  const saved = new Set((wishlist.data ?? []).map((p) => p.id));
  const onToggle = (p: { id: string; name: string }) => {
    if (!signedIn) {
      toast("Sign in to save favourites", {
        description: "Your wishlist is kept in your account.",
        action: { label: "Sign in", onClick: () => void navigate({ to: "/login", search: { redirect: window.location.pathname } }) },
      });
      return;
    }
    const wasSaved = saved.has(p.id);
    toggle.mutate(
      { productId: p.id, saved: wasSaved },
      {
        onSuccess: () => toast(wasSaved ? "Removed from wishlist" : "Saved to wishlist", { description: p.name }),
        onError: (e) => toast.error(isApiError(e) ? e.message : "Couldn't update your wishlist"),
      },
    );
  };
  return { saved, onToggle, pending: toggle.isPending };
}

export function ProductCard({ product: p, priority = false, onToggleWish, saved }: { product: ProductCardDTO; priority?: boolean; onToggleWish: (p: ProductCardDTO) => void; saved: boolean }) {
  return (
    <article className="group relative">
      <div className="relative aspect-[4/5] overflow-hidden bg-card">
        <Link to="/products/$slug" params={{ slug: p.slug }} className="block h-full w-full" aria-label={p.name}>
          {p.image ? (
            <>
              <SmartImage
                src={p.image.url}
                alt={p.image.alt}
                width={600}
                loading={priority ? "eager" : "lazy"}
                {...(priority ? { fetchPriority: "high" as const } : {})}
                className={cn("h-full w-full object-cover transition duration-700 group-hover:scale-105", p.hoverImage && "group-hover:opacity-0")}
              />
              {p.hoverImage && <SmartImage src={p.hoverImage.url} alt="" width={600} loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-700 group-hover:opacity-100" />}
            </>
          ) : (
            <SmartImage src="" alt={p.name} className="h-full w-full" />
          )}
        </Link>
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {!p.inStock && <span className="bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-paper">Sold out</span>}
          {p.inStock && p.discountPercent > 0 && <span className="bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-paper">{p.discountPercent}% off</span>}
          {p.inStock && p.isNew && <span className="bg-paper px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-ink">New</span>}
        </div>
        <button
          type="button"
          onClick={() => onToggleWish(p)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`}
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-paper/90 transition hover:scale-110 hover:text-brand"
        >
          <Heart className={cn("size-4", saved && "fill-brand text-brand")} />
        </button>
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug md:text-base">
          <Link to="/products/$slug" params={{ slug: p.slug }} className="decoration-brand decoration-2 underline-offset-4 hover:underline">
            {p.name}
          </Link>
        </h3>
        {p.colors.length > 1 && (
          <ul className="flex shrink-0 gap-1 pt-1" aria-label={`${p.colors.length} colours`}>
            {p.colors.slice(0, 4).map((c) => (
              <li key={c.id} title={c.name} className="size-3 rounded-full border" style={{ backgroundColor: c.hex }} />
            ))}
          </ul>
        )}
      </div>
      <Price pricePaise={p.pricePaise} compareAtPaise={p.compareAtPaise} className="mt-1 text-sm md:text-base" />
      {p.ratingAvg != null && p.ratingCount > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          ★ {p.ratingAvg.toFixed(1)} <span className="sr-only">out of 5,</span> ({p.ratingCount} review{p.ratingCount === 1 ? "" : "s"})
        </p>
      )}
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[4/5] w-full" />
      <Skeleton className="mt-3 h-4 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/3" />
    </div>
  );
}

export function ProductGrid({ products, loading, skeletons = 8, priorityCount = 0 }: { products: ProductCardDTO[] | undefined; loading?: boolean; skeletons?: number; priorityCount?: number }) {
  const { saved, onToggle } = useWishlistToggle();
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-10 md:gap-x-5 lg:grid-cols-4">
      {loading && !products?.length
        ? Array.from({ length: skeletons }, (_, i) => <ProductCardSkeleton key={i} />)
        : products?.map((p, i) => <ProductCard key={p.id} product={p} priority={i < priorityCount} saved={saved.has(p.id)} onToggleWish={onToggle} />)}
    </div>
  );
}
