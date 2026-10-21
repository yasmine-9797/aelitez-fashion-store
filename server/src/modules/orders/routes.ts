import { Router } from "express";
import { z } from "zod";
import { returnRequestSchema, RETURN_REASONS } from "@shared/validation";
import { currentUser, requireAuth } from "../../middleware/auth.ts";
import { writeLimiter } from "../../middleware/rate-limit.ts";
import { notFound } from "../../lib/errors.ts";
import { ok, pageMeta, parse, param } from "../../lib/http.ts";
import { prisma } from "../../lib/prisma.ts";
import { cancelOrder, orderDetailInclude, requestReturn, toOrderDetail, toOrderSummary } from "./service.ts";

export const ordersRouter = Router();
ordersRouter.use("/orders", requireAuth, (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

ordersRouter.get("/orders", async (req, res) => {
  const user = currentUser(req);
  const { page } = parse(z.object({ page: z.coerce.number().int().min(1).max(500).default(1) }), req.query);
  const pageSize = 10;
  const [rows, total] = await Promise.all([
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { items: true } }),
    prisma.order.count({ where: { userId: user.id } }),
  ]);
  res.json({ data: rows.map(toOrderSummary), meta: pageMeta(page, pageSize, total) });
});

/** Customers can only ever load their own orders — another customer's id is a plain 404. */
async function ownOrder(userId: string, id: string) {
  const order = await prisma.order.findFirst({ where: { id, userId }, include: orderDetailInclude });
  if (!order) throw notFound("Order");
  return order;
}

ordersRouter.get("/orders/:id", async (req, res) => {
  res.json(ok(toOrderDetail(await ownOrder(currentUser(req).id, param(req, "id")))));
});

ordersRouter.post("/orders/:id/cancel", writeLimiter, async (req, res) => {
  const user = currentUser(req);
  const { reason } = parse(z.object({ reason: z.string().trim().max(300).optional() }), req.body ?? {});
  await ownOrder(user.id, param(req, "id"));
  await cancelOrder(param(req, "id"), user.id, reason ? `Cancelled by customer: ${reason}` : "Cancelled by customer", { customerId: user.id });
  res.json(ok(toOrderDetail(await ownOrder(user.id, param(req, "id")))));
});

ordersRouter.post("/orders/:id/returns", writeLimiter, async (req, res) => {
  const user = currentUser(req);
  const input = parse(returnRequestSchema, req.body);
  await requestReturn(user.id, param(req, "id"), { reason: RETURN_REASONS[input.reason], details: input.details });
  res.status(201).json(ok(toOrderDetail(await ownOrder(user.id, param(req, "id")))));
});
