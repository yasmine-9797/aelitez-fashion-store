// Server-side cart for signed-in customers and guests. Guests are identified by a random token in
// an HttpOnly cookie (only its hash is stored); the guest cart merges into the account on sign-in.
// Prices and availability always come from the database, never from the browser.
import type { Request, Response } from "express";
import type { CartDTO, CartIssue, CartItemDTO } from "@shared/types";
import { env } from "../../config/env.ts";
import { COOKIE, GUEST_CART_TTL_MS, clearCookie, cookieOptions } from "../../lib/cookies.ts";
import { randomToken, sha256 } from "../../lib/crypto.ts";
import { conflict, notFound } from "../../lib/errors.ts";
import { Prisma, ProductStatus, prisma, type Db } from "../../lib/prisma.ts";

export const cartItemInclude = {
  variant: {
    select: {
      id: true,
      sku: true,
      isActive: true,
      pricePaise: true,
      colorId: true,
      size: { select: { label: true } },
      color: { select: { name: true } },
      inventory: { select: { onHand: true, reserved: true } },
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          pricePaise: true,
          compareAtPaise: true,
          discountPercent: true,
          images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, alt: true, width: true, height: true, colorId: true } },
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;
export type CartItemRow = Prisma.CartItemGetPayload<{ include: typeof cartItemInclude }>;

const availableOf = (row: CartItemRow) => (row.variant.inventory ? Math.max(0, row.variant.inventory.onHand - row.variant.inventory.reserved) : 0);
export const unitPriceOf = (row: CartItemRow) => row.variant.pricePaise ?? row.variant.product.pricePaise;
export const isSellable = (row: CartItemRow) => row.variant.isActive && row.variant.product.status === ProductStatus.ACTIVE;

export function toCartItem(row: CartItemRow): CartItemDTO {
  const p = row.variant.product;
  const avail = availableOf(row);
  let issue: CartIssue | null = null;
  if (!isSellable(row)) issue = "UNAVAILABLE";
  else if (avail === 0) issue = "OUT_OF_STOCK";
  else if (row.quantity > avail) issue = "QUANTITY_REDUCED";
  const image = p.images.find((i) => i.colorId === row.variant.colorId) ?? p.images[0] ?? null;
  const unit = unitPriceOf(row);
  return {
    id: row.id,
    variantId: row.variantId,
    productId: p.id,
    productSlug: p.slug,
    productName: p.name,
    sku: row.variant.sku,
    size: row.variant.size.label,
    color: row.variant.color.name,
    image,
    unitPricePaise: unit,
    compareAtPaise: p.discountPercent > 0 && row.variant.pricePaise == null ? p.compareAtPaise : null,
    quantity: row.quantity,
    lineTotalPaise: unit * row.quantity,
    available: Math.min(avail, env.MAX_CART_QUANTITY),
    issue,
  };
}

export function toCartDTO(cart: { id: string; items: CartItemRow[] } | null): CartDTO {
  const items = (cart?.items ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(toCartItem);
  return {
    id: cart?.id ?? "",
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    subtotalPaise: items.filter((i) => i.issue === null).reduce((s, i) => s + i.lineTotalPaise, 0),
    purchasable: items.length > 0 && items.every((i) => i.issue === null),
  };
}

const guestToken = (req: Request): string | null => {
  const t: unknown = req.cookies?.[COOKIE.guestCart];
  return typeof t === "string" && t.length >= 32 && t.length <= 64 ? t : null;
};

/** Finds the caller's cart; with `create`, makes one (and the guest cookie) if missing. */
export async function resolveCart(req: Request, res: Response, create: boolean): Promise<{ id: string } | null> {
  if (req.user) {
    const existing = await prisma.cart.findUnique({ where: { userId: req.user.id }, select: { id: true } });
    if (existing || !create) return existing;
    return prisma.cart.upsert({ where: { userId: req.user.id }, create: { userId: req.user.id }, update: {}, select: { id: true } });
  }
  const token = guestToken(req);
  if (token) {
    const existing = await prisma.cart.findUnique({ where: { guestTokenHash: sha256(token) }, select: { id: true } });
    if (existing) return existing;
  }
  if (!create) return null;
  const fresh = randomToken();
  res.cookie(COOKIE.guestCart, fresh, cookieOptions(GUEST_CART_TTL_MS));
  return prisma.cart.create({ data: { guestTokenHash: sha256(fresh) }, select: { id: true } });
}

export async function loadCart(db: Db, cartId: string) {
  return db.cart.findUnique({ where: { id: cartId }, select: { id: true, items: { include: cartItemInclude } } });
}

export async function getCart(req: Request, res: Response): Promise<CartDTO> {
  const ref = await resolveCart(req, res, false);
  return toCartDTO(ref ? await loadCart(prisma, ref.id) : null);
}

async function sellableVariant(variantId: string) {
  const v = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, isActive: true, product: { select: { status: true } }, inventory: { select: { onHand: true, reserved: true } } },
  });
  if (!v || !v.isActive || v.product.status !== ProductStatus.ACTIVE) throw notFound("Product option");
  return { ...v, available: v.inventory ? Math.max(0, v.inventory.onHand - v.inventory.reserved) : 0 };
}

function checkQuantity(quantity: number, available: number) {
  if (available === 0) throw conflict("This size is out of stock.", "OUT_OF_STOCK");
  if (quantity > env.MAX_CART_QUANTITY) throw conflict(`You can buy up to ${env.MAX_CART_QUANTITY} of an item per order.`, "QUANTITY_LIMIT");
  if (quantity > available) throw conflict(`Only ${available} left in this size.`, "INSUFFICIENT_STOCK");
}

export async function addItem(req: Request, res: Response, variantId: string, quantity: number): Promise<CartDTO> {
  const variant = await sellableVariant(variantId);
  const cart = (await resolveCart(req, res, true))!;
  const existing = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } }, select: { quantity: true } });
  const next = (existing?.quantity ?? 0) + quantity;
  checkQuantity(next, variant.available);
  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    create: { cartId: cart.id, variantId, quantity },
    update: { quantity: next },
  });
  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
  return toCartDTO(await loadCart(prisma, cart.id));
}

/** Loads a cart line only if it belongs to the caller's cart (ownership check). */
async function ownedItem(req: Request, res: Response, itemId: string) {
  const cart = await resolveCart(req, res, false);
  const item = cart ? await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id }, select: { id: true, variantId: true, quantity: true, cartId: true } }) : null;
  if (!item) throw notFound("Bag item");
  return item;
}

export async function updateItem(req: Request, res: Response, itemId: string, quantity: number): Promise<CartDTO> {
  const item = await ownedItem(req, res, itemId);
  // Lowering a quantity is always allowed; raising it is checked against live stock.
  if (quantity > item.quantity) checkQuantity(quantity, (await sellableVariant(item.variantId)).available);
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return toCartDTO(await loadCart(prisma, item.cartId));
}

export async function removeItem(req: Request, res: Response, itemId: string): Promise<CartDTO> {
  const item = await ownedItem(req, res, itemId);
  await prisma.cartItem.delete({ where: { id: item.id } });
  return toCartDTO(await loadCart(prisma, item.cartId));
}

/** Moves a guest cart into the user's cart after sign-in (quantities summed, capped at the limit). */
export async function mergeGuestCart(req: Request, res: Response, userId: string): Promise<void> {
  const token = guestToken(req);
  if (!token) return;
  clearCookie(res, COOKIE.guestCart);
  const guest = await prisma.cart.findUnique({ where: { guestTokenHash: sha256(token) }, select: { id: true, items: { select: { variantId: true, quantity: true } } } });
  if (!guest) return;
  await prisma.$transaction(async (tx) => {
    const target = await tx.cart.upsert({ where: { userId }, create: { userId }, update: {}, select: { id: true } });
    for (const item of guest.items) {
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } } });
      const quantity = Math.min(env.MAX_CART_QUANTITY, (existing?.quantity ?? 0) + item.quantity);
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } },
        create: { cartId: target.id, variantId: item.variantId, quantity },
        update: { quantity },
      });
    }
    await tx.cart.delete({ where: { id: guest.id } });
  });
}
