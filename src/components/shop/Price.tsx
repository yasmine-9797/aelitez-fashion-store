import { discountPercent, formatINR } from "@shared/money";
import { cn } from "@/lib/utils";

/** Selling price, with the original price and real discount when the product is on offer. */
export function Price({ pricePaise, compareAtPaise, size = "md", className }: { pricePaise: number; compareAtPaise: number | null; size?: "md" | "lg"; className?: string }) {
  const off = discountPercent(pricePaise, compareAtPaise);
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("font-bold", off > 0 && "text-brand", size === "lg" ? "text-2xl" : "")}>
        <span className="sr-only">{off > 0 ? "Sale price " : "Price "}</span>
        {formatINR(pricePaise)}
      </span>
      {off > 0 && compareAtPaise && (
        <>
          <s className={cn("text-muted-foreground", size === "lg" ? "text-base" : "text-sm")}>
            <span className="sr-only">Original price </span>
            {formatINR(compareAtPaise)}
          </s>
          <span className={cn("font-bold text-brand", size === "lg" ? "text-sm" : "text-xs")}>{off}% off</span>
        </>
      )}
    </p>
  );
}
