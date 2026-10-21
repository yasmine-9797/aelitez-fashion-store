import { Router } from "express";
import { z } from "zod";
import { DEPARTMENTS, productListQuerySchema } from "@shared/catalog";
import { reviewSchema } from "@shared/validation";
import { currentUser, requireAuth } from "../../middleware/auth.ts";
import { writeLimiter } from "../../middleware/rate-limit.ts";
import { ok, parse, param } from "../../lib/http.ts";
import * as catalog from "./service.ts";
import { createReview, reviewEligibility } from "./reviews.ts";

export const catalogRouter = Router();

/** Public catalogue responses may be cached briefly by browsers and CDNs. */
const cachePublic = (res: import("express").Response, seconds = 60) => res.set("Cache-Control", `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`);

catalogRouter.get("/home", async (_req, res) => {
  cachePublic(res);
  res.json(ok(await catalog.homeSections()));
});

catalogRouter.get("/categories", async (req, res) => {
  const q = parse(z.object({ department: z.enum(DEPARTMENTS).optional(), nonEmpty: z.enum(["0", "1"]).optional() }), req.query);
  cachePublic(res);
  res.json(ok(await catalog.categoryTree({ department: q.department, nonEmpty: q.nonEmpty === "1" })));
});

catalogRouter.get("/categories/:slug", async (req, res) => {
  cachePublic(res);
  res.json(ok(await catalog.getCategory(param(req, "slug"))));
});

catalogRouter.get("/products", async (req, res) => {
  const q = parse(productListQuerySchema, req.query);
  cachePublic(res, 30);
  res.json(ok(await catalog.listProducts(q)));
});

catalogRouter.get("/products/lookup", async (req, res) => {
  const { slugs } = parse(z.object({ slugs: z.string().max(2000).default("") }), req.query);
  const list = slugs.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 24);
  res.json(ok(await catalog.lookupProducts(list)));
});

catalogRouter.get("/products/:slug", async (req, res) => {
  cachePublic(res, 30);
  res.json(ok(await catalog.getProduct(param(req, "slug"))));
});

catalogRouter.get("/products/:slug/related", async (req, res) => {
  cachePublic(res);
  res.json(ok(await catalog.relatedProducts(param(req, "slug"))));
});

catalogRouter.get("/products/:slug/reviews", async (req, res) => {
  const { page } = parse(z.object({ page: z.coerce.number().int().min(1).max(500).default(1) }), req.query);
  res.json(ok(await catalog.productReviews(param(req, "slug"), page)));
});

catalogRouter.get("/products/:slug/reviews/eligibility", requireAuth, async (req, res) => {
  res.json(ok(await reviewEligibility(currentUser(req).id, param(req, "slug"))));
});

catalogRouter.post("/products/:slug/reviews", requireAuth, writeLimiter, async (req, res) => {
  const input = parse(reviewSchema, req.body);
  await createReview(currentUser(req).id, param(req, "slug"), input);
  res.status(201).json(ok({ created: true }));
});

catalogRouter.get("/search", async (req, res) => {
  const { q } = parse(z.object({ q: z.string().max(80).default("") }), req.query);
  res.json(ok(await catalog.searchSuggestions(q)));
});
