# Deploying AELITEZ CLOTHINGS

Three pieces go live: the **PostgreSQL database**, the **API** (`server/`), and the **storefront** (repository root). A typical setup:

| Piece | Example host | Address |
| --- | --- | --- |
| Storefront | Lovable publish (Cloudflare Workers), or any Node/edge host supported by Nitro | `https://www.aelitez.com` |
| API | Any Node.js 22+ host — Render, Railway, Fly.io, a VM/container | `https://api.aelitez.com` |
| Database | Managed PostgreSQL 14+ — Neon, Supabase, AWS RDS, Google Cloud SQL, Azure | private connection string |

Put the storefront and API on **the same parent domain** (`www.` + `api.`). The session cookie then works with the default `COOKIE_SAMESITE=lax`. If they must be on different domains, set `COOKIE_SAMESITE=none` (HTTPS only).

---

## 1. Database

1. Create a PostgreSQL database and a dedicated user with access to it only.
2. Use the connection string with TLS required, e.g. `postgresql://USER:PASSWORD@HOST:5432/aelitez?sslmode=require`.
3. **Backups:** turn on automated daily backups and point-in-time recovery (most managed providers include it). Keep at least 14 days, and **test a restore** before launch and every few months. Take a manual snapshot before every migration.

## 2. API (`server/`)

Build and start commands:

```sh
npm ci
npm run build                     # generates the Prisma client and bundles dist/index.js
npm run db:migrate                # prisma migrate deploy — run on each release, before start
npm start                         # node dist/index.js
```

Run `npm run db:migrate` as a release/pre-deploy step, not at runtime. **Do not run the demo seed in production.** To load only the reference data (sizes, colours, categories, delivery options) run `NODE_ENV=production npm run db:seed` — demo products are never seeded when `NODE_ENV=production`.

Create the first administrator once, from a one-off shell on the host:

```sh
ADMIN_EMAIL=owner@aelitez.com ADMIN_PASSWORD='a-long-unique-passphrase-1' ADMIN_NAME='Owner' npm run create-admin
```

Then remove those variables. Add staff the same way with `ADMIN_ROLE=STAFF`.

### Production environment

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | as provided by the host |
| `DATABASE_URL` | the managed database URL |
| `PUBLIC_API_URL` | `https://api.aelitez.com` |
| `STOREFRONT_URL` | `https://www.aelitez.com` |
| `CORS_ORIGINS` | `https://www.aelitez.com` (comma-separate extra origins, e.g. the Lovable preview URL) |
| `TRUST_PROXY` | `1` behind a load balancer / platform proxy (needed for correct client IPs and rate limits) |
| `COOKIE_SAMESITE` / `COOKIE_DOMAIN` | `lax` / optional `.aelitez.com` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | live keys (all three, or none) |
| `COD_ENABLED` | `true` only if you offer cash on delivery |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | your email provider |
| `UPLOAD_DIR` | a path on a **persistent volume** (product photos are stored here) |

Keep secrets in the host's secret manager — never in the repository. The API refuses to start in production with unsafe values: http URLs, localhost CORS, or a partial set of Razorpay keys.

### Health checks

- Liveness: `GET /api/v1/health`
- Readiness (checks the database): `GET /api/v1/health/ready` — use this for the load balancer / platform health check.

### Background job

Unpaid online orders release their reserved stock after `PAYMENT_TIMEOUT_MINUTES`. The API does this every minute in-process. If you run several instances, or prefer a scheduler, set `DISABLE_JOBS=true` and schedule `npm run jobs:release-expired` every minute or two. The job is safe to run concurrently.

### Scaling notes

- **Images:** local disk needs a persistent volume shared by all instances. Alternatively, implement the `Storage` interface in `server/src/lib/storage.ts` with S3, Cloudflare R2 or GCS.
- **Rate limits:** counters are kept in memory per instance. With more than one instance, add a shared store (for example Redis via `rate-limit-redis`) in `server/src/middleware/rate-limit.ts`.

### Logging and error monitoring

- Logs are structured JSON (pino) on stdout; cookies, tokens, passwords and payment signatures are redacted. Ship stdout to your host's log service.
- Every response carries an `X-Request-Id`, and unexpected errors are logged with it. Customers see the id as a reference, never a stack trace.
- To add Sentry or another error tracker, initialise it in `server/src/index.ts` and report from `errorHandler` in `server/src/middleware/error.ts` (the single place unexpected errors are handled). On the storefront, `src/lib/lovable-error-reporting.ts` and the root `errorComponent` are the integration points.

## 3. Payments (Razorpay)

1. In the Razorpay dashboard, create API keys (test first, then live), and set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
2. Add a webhook pointing to `https://api.aelitez.com/api/v1/payments/webhook`, with a strong secret (set it as `RAZORPAY_WEBHOOK_SECRET`) and these events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`.
3. Turn on automatic payment capture. The API also captures authorised payments itself during verification.
4. Place a full test order with test keys: pay, refund from **Admin → Orders**, and confirm the webhook deliveries succeed in the Razorpay dashboard.

An order is never marked paid from the browser alone. Payment must be verified by signature plus a server-side check with Razorpay, or by a signed webhook.

## 4. Storefront (repository root)

Set the build-time environment variables:

```
VITE_API_URL=https://api.aelitez.com
VITE_SITE_URL=https://www.aelitez.com
```

- **Lovable:** add both in the project's environment settings, then publish. Lovable builds the root app only.
- **Elsewhere:** `npm ci && npm run build`. Nitro outputs to `.output/` for the configured target (Cloudflare by default). Follow Nitro's deployment instructions for your host.

`/robots.txt` and `/sitemap.xml` are generated from the live catalogue. Submit the sitemap in Google Search Console.

## 5. Domain and HTTPS

1. Point `www.aelitez.com` at the storefront host and `api.aelitez.com` at the API host (CNAME or A records, as each host instructs). Redirect the bare `aelitez.com` to `www`.
2. Enable HTTPS on both hosts. Every listed host issues free certificates; behind your own load balancer, use Let's Encrypt. HSTS is already sent by the API. Enable it on the storefront host too once HTTPS works.
3. Re-check `CORS_ORIGINS`, `STOREFRONT_URL`, `PUBLIC_API_URL` and `VITE_*` against the final addresses.

## 6. Release checklist

- [ ] API tests pass: `cd server && npm test`
- [ ] Builds pass: `npm run build` (root) and `cd server && npm run build`
- [ ] End-to-end tests pass: `cd e2e && npm test`
- [ ] `cd server && npm run audit:deps` shows no high-severity issues
- [ ] Database backup / snapshot taken
- [ ] `npm run db:migrate` applied before the new API version starts
- [ ] `/api/v1/health/ready` returns `ready`
- [ ] A test order (and refund) completed on the live site
