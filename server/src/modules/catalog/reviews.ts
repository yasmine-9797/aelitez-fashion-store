// Customer reviews: only verified purchasers (a delivered order containing the product) may review.
import { conflict, forbidden, notFound } from "../../lib/errors.ts";
import { OrderStatus, ProductStatus, ReviewStatus, prisma, type Db } from "../../lib/prisma.ts";

const RECEIVED_STATUSES = [OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED, OrderStatus.RETURNED, OrderStatus.REFUNDED];

/** Recomputes a product's rating from its published reviews. */
export async function refreshRating(db: Db, productId: string): Promise<void> {
  const agg = await db.review.aggregate({ where: { productId, status: ReviewStatus.PUBLISHED }, _avg: { rating: true }, _count: { _all: true } });
  const count = agg._count._all;
  await db.product.update({
    where: { id: productId },
    data: { ratingCount: count, ratingAvg: count > 0 && agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : null },
  });
}

async function eligibleOrder(userId: string, productId: string) {
  return prisma.order.findFirst({
    where: { userId, status: { in: RECEIVED_STATUSES }, items: { some: { productId } } },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function reviewEligibility(userId: string, slug: string) {
  const product = await prisma.product.findFirst({ where: { slug, status: ProductStatus.ACTIVE }, select: { id: true } });
  if (!product) throw notFound("Product");
  const existing = await prisma.review.findUnique({ where: { productId_userId: { productId: product.id, userId } }, select: { id: true } });
  if (existing) return { canReview: false, reason: "You've already reviewed this product." };
  if (!(await eligibleOrder(userId, product.id))) return { canReview: false, reason: "Reviews can be written once your order has been delivered." };
  return { canReview: true, reason: null };
}

export async function createReview(userId: string, slug: string, input: { rating: number; title?: string | undefined; body: string }) {
  const product = await prisma.product.findFirst({ where: { slug, status: ProductStatus.ACTIVE }, select: { id: true } });
  if (!product) throw notFound("Product");
  const order = await eligibleOrder(userId, product.id);
  if (!order) throw forbidden("Only customers who received this product can review it.");
  const existing = await prisma.review.findUnique({ where: { productId_userId: { productId: product.id, userId } }, select: { id: true } });
  if (existing) throw conflict("You've already reviewed this product.", "REVIEW_EXISTS");
  await prisma.$transaction(async (tx) => {
    await tx.review.create({ data: { productId: product.id, userId, orderId: order.id, rating: input.rating, title: input.title ?? null, body: input.body } });
    await refreshRating(tx, product.id);
  });
}
