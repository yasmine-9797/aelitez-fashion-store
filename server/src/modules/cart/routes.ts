import { Router } from "express";
import { z } from "zod";
import { addCartItemSchema, updateCartItemSchema } from "@shared/validation";
import { currentUser, requireAuth } from "../../middleware/auth.ts";
import { notFound } from "../../lib/errors.ts";
import { ok, parse, param } from "../../lib/http.ts";
import { ProductStatus, prisma } from "../../lib/prisma.ts";
import { cardSelect, toCard } from "../catalog/service.ts";
import * as cart from "./service.ts";

export const cartRouter = Router();

// Carts are per-visitor — never cache.
cartRouter.use(["/cart", "/wishlist"], (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

cartRouter.get("/cart", async (req, res) => {
  res.json(ok(await cart.getCart(req, res)));
});

cartRouter.post("/cart/items", async (req, res) => {
  const { variantId, quantity } = parse(addCartItemSchema, req.body);
  res.status(201).json(ok(await cart.addItem(req, res, variantId, quantity)));
});

cartRouter.patch("/cart/items/:id", async (req, res) => {
  const { quantity } = parse(updateCartItemSchema, req.body);
  res.json(ok(await cart.updateItem(req, res, param(req, "id"), quantity)));
});

cartRouter.delete("/cart/items/:id", async (req, res) => {
  res.json(ok(await cart.removeItem(req, res, param(req, "id"))));
});

// ───────────── Wishlist (signed-in customers) ─────────────

async function wishlistOf(userId: string) {
  const wl = await prisma.wishlist.findUnique({
    where: { userId },
    select: { items: { orderBy: { createdAt: "desc" }, select: { product: { select: { ...cardSelect, status: true } } } } },
  });
  return (wl?.items ?? []).filter((i) => i.product.status === ProductStatus.ACTIVE).map((i) => toCard(i.product));
}

cartRouter.get("/wishlist", requireAuth, async (req, res) => {
  res.json(ok(await wishlistOf(currentUser(req).id)));
});

cartRouter.post("/wishlist/items", requireAuth, async (req, res) => {
  const user = currentUser(req);
  const { productId } = parse(z.object({ productId: z.string().min(1).max(40) }), req.body);
  const product = await prisma.product.findFirst({ where: { id: productId, status: ProductStatus.ACTIVE }, select: { id: true } });
  if (!product) throw notFound("Product");
  const wl = await prisma.wishlist.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {}, select: { id: true } });
  await prisma.wishlistItem.upsert({ where: { wishlistId_productId: { wishlistId: wl.id, productId } }, create: { wishlistId: wl.id, productId }, update: {} });
  res.status(201).json(ok(await wishlistOf(user.id)));
});

cartRouter.delete("/wishlist/items/:productId", requireAuth, async (req, res) => {
  const user = currentUser(req);
  const wl = await prisma.wishlist.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (wl) await prisma.wishlistItem.deleteMany({ where: { wishlistId: wl.id, productId: param(req, "productId") } });
  res.json(ok(await wishlistOf(user.id)));
});
