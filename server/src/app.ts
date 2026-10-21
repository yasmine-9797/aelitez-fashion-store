import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Router } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env, originAllowed } from "./config/env.ts";
import { logger } from "./lib/logger.ts";
import { uploadRoot } from "./lib/storage.ts";
import { loadSession, requirePermission } from "./middleware/auth.ts";
import { csrfProtection } from "./middleware/csrf.ts";
import { errorHandler, notFoundHandler } from "./middleware/error.ts";
import { apiLimiter } from "./middleware/rate-limit.ts";
import { adminCatalogRouter } from "./modules/admin/catalog.ts";
import { adminOpsRouter } from "./modules/admin/operations.ts";
import { authRouter } from "./modules/auth/routes.ts";
import { cartRouter } from "./modules/cart/routes.ts";
import { catalogRouter } from "./modules/catalog/routes.ts";
import { checkoutRouter } from "./modules/checkout/routes.ts";
import { ordersRouter } from "./modules/orders/routes.ts";
import { paymentsRouter, razorpayWebhook } from "./modules/payments/routes.ts";
import { systemRouter } from "./modules/system/routes.ts";

/** Full request path without the query string (originalUrl survives Express router mounting). */
const pathOf = (req: { url?: string | undefined }) => ((req as express.Request).originalUrl ?? req.url ?? "").split("?")[0];

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);
  app.set("query parser", "simple");

  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set("X-Request-Id", req.requestId);
    next();
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId,
      autoLogging: { ignore: (req) => req.url?.startsWith("/api/v1/health") ?? false },
      // One concise line per request: "GET /api/v1/products 200 12ms". Query strings are dropped
      // (they can contain search terms), and no headers are logged.
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
      customSuccessMessage: (req, res, ms) => `${req.method} ${pathOf(req)} ${res.statusCode} ${Math.round(ms)}ms`,
      customErrorMessage: (req, res, err) => `${req.method} ${pathOf(req)} ${res.statusCode} — ${err.message}`,
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url?.split("?")[0] }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || originAllowed(origin)),
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      allowedHeaders: ["content-type", "x-csrf-token"],
      exposedHeaders: ["x-request-id"],
      maxAge: 600,
    }),
  );

  // Uploaded product images: immutable, served to the storefront's origin.
  app.use(
    "/uploads",
    helmet.crossOriginResourcePolicy({ policy: "cross-origin" }),
    express.static(uploadRoot, { index: false, dotfiles: "deny", immutable: true, maxAge: "365d", fallthrough: false }),
  );

  // The webhook needs the exact raw bytes for signature verification, and is authenticated by
  // that signature rather than cookies — so it sits before the JSON parser and CSRF check.
  app.post("/api/v1/payments/webhook", express.raw({ type: "application/json", limit: "1mb" }), razorpayWebhook);

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  const api = Router();
  api.use(apiLimiter, loadSession, csrfProtection);
  api.use(systemRouter, authRouter, catalogRouter, cartRouter, checkoutRouter, ordersRouter, paymentsRouter);

  const admin = Router();
  admin.use(requirePermission("admin:access"), (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  admin.use(adminCatalogRouter, adminOpsRouter);
  api.use("/admin", admin);

  app.use("/api/v1", api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
