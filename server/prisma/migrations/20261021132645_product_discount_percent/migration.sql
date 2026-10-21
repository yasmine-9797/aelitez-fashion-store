-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "discountPercent" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Product_status_discountPercent_idx" ON "Product"("status", "discountPercent");

-- Keep the derived discount honest: it must match the prices (rounded down).
ALTER TABLE "Product" ADD CONSTRAINT "Product_discountPercent_consistent" CHECK (
  "discountPercent" = CASE
    WHEN "compareAtPaise" IS NULL OR "compareAtPaise" <= "pricePaise" THEN 0
    ELSE FLOOR((("compareAtPaise" - "pricePaise") * 100)::numeric / "compareAtPaise")::int
  END
);
