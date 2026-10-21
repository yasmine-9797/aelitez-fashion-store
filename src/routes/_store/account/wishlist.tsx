import { createFileRoute } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { ProductGrid } from "@/components/shop/ProductCard";
import { ButtonLink, EmptyState, Spinner } from "@/components/shop/ui";
import { useWishlist } from "@/lib/queries";

export const Route = createFileRoute("/_store/account/wishlist")({ component: Wishlist });

function Wishlist() {
  const list = useWishlist(true);
  if (list.isLoading) return <Spinner label="Loading your wishlist" />;
  if (!list.data?.length) return <EmptyState icon={<Heart className="size-12" />} title="Nothing saved yet" body="Tap the heart on any product to save it here." action={<ButtonLink to="/shop">Discover new arrivals</ButtonLink>} />;
  return (
    <div>
      <h2 className="mb-6 text-xl font-bold">
        Wishlist ({list.data.length})
      </h2>
      <ProductGrid products={list.data} />
    </div>
  );
}
