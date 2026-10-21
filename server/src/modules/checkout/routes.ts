import { Router } from "express";
import { z } from "zod";
import { checkoutSchema } from "@shared/validation";
import { currentUser, requireAuth } from "../../middleware/auth.ts";
import { checkoutLimiter } from "../../middleware/rate-limit.ts";
import { ok, parse } from "../../lib/http.ts";
import { activeShippingMethods, placeOrder, quote } from "./service.ts";

export const checkoutRouter = Router();

checkoutRouter.get("/shipping-methods", async (_req, res) => {
  res.json(ok(await activeShippingMethods()));
});

checkoutRouter.post("/checkout/quote", requireAuth, async (req, res) => {
  const input = parse(z.object({ shippingMethodCode: z.string().max(40).optional(), couponCode: z.string().trim().max(40).optional() }), req.body);
  res.json(ok(await quote(currentUser(req), input)));
});

checkoutRouter.post("/checkout", requireAuth, checkoutLimiter, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const input = parse(checkoutSchema, req.body);
  res.status(201).json(ok(await placeOrder(currentUser(req), input)));
});
