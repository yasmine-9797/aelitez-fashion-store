# AELITEZ CLOTHINGS — online store

Full-stack e-commerce platform for **AELITEZ CLOTHINGS**, Tiruppur — *The Trendiest Fashion in India • Premium for Less*.

The store sells **children's and women's fashion only**: baby & infant, toddler, girls', boys', teen girls' and women's clothing and accessories. There is no men's department — the database, API and admin all refuse men's categories (boys' clothing is part of Kids).

- **Storefront** — homepage, shop / kids / women listings with filters, product pages, cart, checkout, customer accounts, order tracking and returns.
- **Admin panel** (`/admin`) — dashboard, orders, returns & refunds, products, photos, variants, inventory, categories, coupons, delivery options, review moderation, audit log.
- **API** (`server/`) — Node.js + Express + PostgreSQL (Prisma). Prices, discounts, stock and totals are always calculated on the server.

> Deploying? See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Repository layout

```
/                      Storefront + admin UI (TanStack Start, React, Tailwind) — stays at the root for Lovable
  src/routes/            Pages (file-based routing): _store/* = storefront, admin/* = admin panel
  src/components/        UI (shop/, layout/, admin/)
  src/lib/               API client, data hooks, SEO, helpers
shared/                Code used by both the storefront and the API: validation schemas, money,
                       pricing, order status rules, API types
server/                REST API (Express 5, Prisma 7, PostgreSQL)
  prisma/                schema.prisma, migrations/, seed.ts
  src/modules/           auth, catalog, cart, checkout, orders, payments, admin, system …
  test/                  API integration tests (Vitest + Supertest against a real PostgreSQL)
e2e/                   End-to-end browser tests (Playwright)
docs/                  Deployment guide
```

The storefront stays at the repository root (rather than `apps/web`) because this project syncs with **Lovable**, which builds from the root. The API and tests are separate packages with their own `package.json`, so they never affect the Lovable build.

## Brand

Use only the logo palette — tokens live in `src/styles.css`:

| Token | Value | Use |
| --- | --- | --- |
| `brand` | `#E11D24` | Calls to action, offers, highlights (the red of the logo) |
| `ink` | `#141414` | Text, dark sections (the black of the wordmark) |
| `paper` | `#FFFFFF` | Backgrounds |
| greys | neutral | Secondary text such as "CLOTHINGS" |

No other accent colours and no gradients; the logo is always the plain disc (`Logo` in `src/components/shop/Logo.tsx`), never inside a ring. Display type is Anton; body type is Montserrat.

---

## Running it locally

**Everyday use (after the one-time setup below):** from the project folder run

```sh
npm run dev:all
```

It starts the local database (if you use the built-in one), the API and the storefront in one terminal, reuses anything that is already running, and restarts anything that stops. Open http://localhost:8080 (admin at `/admin`). Ctrl+C stops it. If a page says the API isn't responding, this command isn't running.

**You need:** Node.js 22+, npm, and PostgreSQL 14+ (any local install, Docker, or a hosted database).

### 1. Database and API

```sh
cd server
npm install

# Option A — use any PostgreSQL you already have:
cp .env.example .env      # then set DATABASE_URL and TEST_DATABASE_URL (two separate databases)

# Option B — let the helper run a private PostgreSQL in server/.pgdata on port 54329
# (uses the PostgreSQL binaries on your machine; set PG_BIN if they aren't found):
npm run db:local          # creates the cluster + databases and writes server/.env

npm run db:migrate        # apply migrations
npm run db:seed           # reference data + a labelled DEMO catalogue (never in production)
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='choose-a-strong-one1' ADMIN_NAME='Your Name' npm run create-admin
npm run dev               # API on http://localhost:4000
```

On Windows PowerShell set the admin variables first, e.g. `$env:ADMIN_EMAIL='you@example.com'`.

### 2. Storefront

```sh
# from the repository root
npm install
cp .env.example .env      # VITE_API_URL=http://localhost:4000, VITE_SITE_URL=http://localhost:8080
npm run dev               # http://localhost:8080 — admin at /admin
```

In development the API accepts the storefront on any `localhost` port (Vite moves to 8081, 8082… if 8080 is busy). In production it accepts only the origins listed in `CORS_ORIGINS`. Run only one copy of each server — a second API on the same port stops with a "port already in use" message.

### Payments and email in development

- **Payments are off by default.** Checkout clearly says payment isn't available until you either set the three `RAZORPAY_*` keys (use Razorpay *test* keys locally) or set `COD_ENABLED=true` in `server/.env`.
- **Email:** without `SMTP_HOST`, development writes emails (verification, password reset, order confirmation) to `server/.outbox/` so you can open the links.

---

## Tests and checks

| What | Command | Notes |
| --- | --- | --- |
| API integration tests | `cd server && npm test` | Real PostgreSQL (`TEST_DATABASE_URL`, wiped each run): auth, CSRF, catalogue filters, cart, coupons, **concurrent checkout / no overselling**, payment signatures, webhook replay, order state machine, returns/refunds, admin permissions |
| API type check / build | `cd server && npm run typecheck && npm run build` | |
| Storefront unit tests | `npm test` | |
| Storefront type check / build | `npx tsc --noEmit && npm run build` | |
| End-to-end (Playwright) | `cd e2e && npm install && npm test` | Starts its own API + storefront on ports 4100/8180 against a throwaway `aelitez_e2e` database. Uses your installed Chrome (`PW_CHANNEL` to change). Covers the shopper checkout journey, admin order fulfilment, men's-category refusal, publishing rules, mobile menu/filters and no horizontal scrolling at 320px |
| Dependency audit | `cd server && npm run audit:deps` | |

---

## Configuration reference

**Storefront** (`.env` at the root — public values only; everything here is bundled into the browser):

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | URL of the API, e.g. `https://api.aelitez.com` |
| `VITE_SITE_URL` | Public storefront URL — canonical links, Open Graph, sitemap |

**API** (`server/.env` — see `server/.env.example` for every option): `DATABASE_URL`, `CORS_ORIGINS`, `STOREFRONT_URL`, `PUBLIC_API_URL`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN`, `TRUST_PROXY`, `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`, `COD_ENABLED`, `PAYMENT_TIMEOUT_MINUTES`, `SMTP_*`, `MAIL_FROM`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `RETURN_WINDOW_DAYS`, `MAX_CART_QUANTITY`. In production the API refuses to start with unsafe settings (http URLs, localhost CORS, partial Razorpay keys).

Never commit `.env` files — only the `.env.example` templates are tracked.

---

## How the important parts work

- **Prices & totals** — the browser never supplies a price. Cart lines, coupon discounts, delivery fees and order totals are recomputed by the API; the database also enforces `total = subtotal − discount + shipping`.
- **Stock** — each variant has `onHand` and `reserved`. Placing an order reserves stock with a single conditional `UPDATE … WHERE onHand − reserved >= qty`, so simultaneous checkouts can never oversell (covered by a concurrency test). Online orders hold stock for `PAYMENT_TIMEOUT_MINUTES`, then release it automatically. Every change is recorded as an inventory movement.
- **Payments** — Razorpay Checkout collects card/UPI details; this system never sees them. An order is marked paid only after a verified signature **and** a server-side check that Razorpay captured the right amount, or a signed webhook. Webhook deliveries are de-duplicated by event id. Cash-on-delivery is optional and is marked paid only when staff record the cash as collected.
- **Order lifecycle** — `shared/order-status.ts` defines every allowed status change. Staff can move orders through processing → packed → shipped (courier details required) → delivered; confirmations, returns and refunds happen only through their own workflows, so an unpaid order can't be marked confirmed or delivered.
- **Security** — Argon2id passwords; server-side sessions in HttpOnly cookies (only token hashes stored); CSRF tokens + origin checks; role-based admin permissions (STAFF vs ADMIN); rate limits on sign-in, password reset, checkout; strict input validation (unknown fields are dropped); image uploads re-encoded with sharp; security headers via Helmet; audit log of admin actions; no stack traces or secrets in responses or logs.
- **Honest storefront** — "Bestsellers" appear only after real sales, testimonials only from verified-purchase reviews, discounts only from real prices, and empty categories are hidden. Customer figures in the brand strip are the business's own claims and are labelled as such.

---

## Before launch

1. Remove the demo catalogue: create the real products in **Admin → Products** (or start from a database seeded with `SEED_DEMO_PRODUCTS=false`). Demo SKUs start with `DEMO-`.
2. Review **Admin → Delivery** — the seeded fees and timelines are placeholders.
3. Decide on payments: add live Razorpay keys and the webhook (see the deployment guide), and/or set `COD_ENABLED`.
4. Configure SMTP so password-reset and order emails are delivered.
5. Replace the placeholder policy pages (`src/routes/_store/policies.$slug.tsx`) with your final shipping, returns, privacy and terms wording.
6. Replace stock photography with your own — credits for the current images are in `src/assets/CREDITS.md`.

### Known limitations

- Returns and refunds cover the whole order (no partial returns or partial refunds yet).
- No PIN-code serviceability check or courier integration — tracking numbers are entered by staff.
- Product images are stored on the API server's disk; use a persistent volume, or swap `server/src/lib/storage.ts` for object storage, when running several instances.
- Rate-limit counters are in memory (per instance) — add a shared store for multi-instance deployments.
- Staff/admin accounts are created with `npm run create-admin` (there is no staff-management screen).
- Razorpay is tested against a simulated gateway in the automated tests; run a payment with Razorpay test keys before going live.

---

## Lovable

This project is connected to [Lovable](https://lovable.dev/projects/2a221efb-455f-43bf-b294-782a86bc77bd). Changes pushed to `main` sync to Lovable — keep the branch building, and don't rewrite pushed history. Lovable builds only the storefront; the API (`server/`) is deployed separately.
