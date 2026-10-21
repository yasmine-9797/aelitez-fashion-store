// Test helpers: database reset, fixtures and a cookie/CSRF-aware HTTP client.
import request from "supertest";
import { createApp } from "../src/app.ts";
import { hmacSha256Hex } from "../src/lib/crypto.ts";
import { hashPassword } from "../src/lib/password.ts";
import { Department, ProductStatus, Role, SizeGroup, prisma } from "../src/lib/prisma.ts";
import { setRazorpayFetch } from "../src/lib/razorpay.ts";

export const app = createApp();
export const ORIGIN = "http://localhost:8080";
export const API = "/api/v1";

export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  setRazorpayFetch(null);
}

/** A browser-like client: keeps cookies and sends the CSRF header + allowed Origin on writes. */
export async function client() {
  const agent = request.agent(app);
  const res = await agent.get(`${API}/auth/csrf`);
  const csrf: string = res.body.data.csrfToken;
  const write = (method: "post" | "patch" | "delete", url: string, body?: unknown) => {
    const req = agent[method](`${API}${url}`).set("x-csrf-token", csrf).set("origin", ORIGIN);
    return body === undefined ? req : req.send(body as object);
  };
  return {
    agent,
    csrf,
    get: (url: string) => agent.get(`${API}${url}`),
    post: (url: string, body?: unknown) => write("post", url, body ?? {}),
    patch: (url: string, body?: unknown) => write("patch", url, body ?? {}),
    del: (url: string) => write("delete", url),
  };
}
export type Client = Awaited<ReturnType<typeof client>>;

let userSeq = 0;
export async function createUser(opts: { role?: Role; password?: string; email?: string; name?: string } = {}) {
  userSeq += 1;
  const password = opts.password ?? "Passw0rd!x";
  const user = await prisma.user.create({
    data: {
      email: opts.email ?? `user${userSeq}-${Date.now()}@example.com`,
      name: opts.name ?? `Test User ${userSeq}`,
      passwordHash: await hashPassword(password),
      role: opts.role ?? Role.CUSTOMER,
      profile: { create: {} },
    },
  });
  return { user, password };
}

/** Creates a user and returns a signed-in client for them. */
export async function signedIn(role: Role = Role.CUSTOMER) {
  const { user, password } = await createUser({ role });
  const c = await client();
  const res = await c.post("/auth/login", { email: user.email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...c, user };
}

let fixtureSeq = 0;
/** A published product with one colour and the given sizes/stock. */
export async function createProduct(opts: {
  department?: Department;
  price?: number;
  compareAt?: number | null;
  stock?: number[];
  status?: ProductStatus;
  categorySlug?: string;
  name?: string;
  ages?: [number, number];
  soldCount?: number;
} = {}) {
  fixtureSeq += 1;
  const department = opts.department ?? Department.WOMEN;
  const group = department === Department.KIDS ? SizeGroup.KIDS : SizeGroup.WOMEN;
  const color = await prisma.color.upsert({ where: { name: "Red" }, create: { name: "Red", hex: "#c8102e" }, update: {} });
  const labels = ["S", "M", "L", "XL"];
  const stock = opts.stock ?? [5];
  const sizes = await Promise.all(
    stock.map((_, i) => prisma.size.upsert({ where: { group_label: { group, label: labels[i]! } }, create: { group, label: labels[i]!, sortOrder: i }, update: {} })),
  );
  const slugBase = (opts.name ?? `Test Product ${fixtureSeq}`).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const category = opts.categorySlug
    ? await prisma.category.upsert({ where: { slug: opts.categorySlug }, create: { name: opts.categorySlug, slug: opts.categorySlug, department }, update: {} })
    : null;
  const price = (opts.price ?? 1000) * 100;
  const compareAt = opts.compareAt ? opts.compareAt * 100 : null;
  const product = await prisma.product.create({
    data: {
      name: opts.name ?? `Test Product ${fixtureSeq}`,
      slug: `${slugBase}-${fixtureSeq}`,
      description: "A product used in automated tests.",
      department,
      status: opts.status ?? ProductStatus.ACTIVE,
      pricePaise: price,
      compareAtPaise: compareAt,
      discountPercent: compareAt ? Math.floor(((compareAt - price) * 100) / compareAt) : 0,
      publishedAt: new Date(),
      soldCount: opts.soldCount ?? 0,
      ageMinMonths: opts.ages?.[0] ?? null,
      ageMaxMonths: opts.ages?.[1] ?? null,
      ...(category ? { categories: { create: { categoryId: category.id } } } : {}),
      images: { create: { url: "https://example.com/img.jpg", alt: "Test image", width: 1200, height: 1500 } },
      variants: {
        create: sizes.map((s, i) => ({ sizeId: s.id, colorId: color.id, sku: `T-${fixtureSeq}-${s.label}`, inventory: { create: { onHand: stock[i]! } } })),
      },
    },
    include: { variants: { include: { size: true, inventory: true }, orderBy: { size: { sortOrder: "asc" } } } },
  });
  return product;
}

export async function seedShipping() {
  return prisma.shippingMethod.upsert({
    where: { code: "standard" },
    create: { code: "standard", name: "Standard delivery", feePaise: 7900, freeAbovePaise: 99900, minDays: 4, maxDays: 7, codAllowed: true },
    update: {},
  });
}

export const ADDRESS = {
  fullName: "Priya Sharma",
  phone: "9876543210",
  line1: "12, Gandhi Street",
  city: "Tiruppur",
  state: "Tamil Nadu",
  pincode: "641604",
};

export const checkoutBody = (paymentMethod: "COD" | "RAZORPAY", extra: Record<string, unknown> = {}) => ({
  contact: { email: "priya@example.com", phone: "9876543210" },
  address: ADDRESS,
  shippingMethodCode: "standard",
  paymentMethod,
  ...extra,
});

export async function stockOf(variantId: string) {
  return prisma.inventory.findUniqueOrThrow({ where: { variantId } });
}

/** Fake Razorpay API: creates orders and returns payments as instructed. */
export function fakeRazorpay(payments: Record<string, { status: string; amount?: number; order_id?: string }> = {}) {
  const orders: { id: string; amount: number }[] = [];
  setRazorpayFetch(async (url, init) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/orders") && init.method === "POST") {
      const body = JSON.parse(String(init.body)) as { amount: number; receipt: string };
      const order = { id: `order_${orders.length + 1}${Date.now()}`, amount: body.amount, currency: "INR", receipt: body.receipt, status: "created" };
      orders.push(order);
      return new Response(JSON.stringify(order), { status: 200 });
    }
    const pay = u.pathname.match(/\/payments\/([^/]+)$/);
    if (pay && init.method === "GET") {
      const p = payments[pay[1]!];
      if (!p) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ id: pay[1], currency: "INR", method: "upi", ...p }), { status: 200 });
    }
    const refund = u.pathname.match(/\/payments\/([^/]+)\/refund$/);
    if (refund) {
      const body = JSON.parse(String(init.body)) as { amount: number };
      return new Response(JSON.stringify({ id: `rfnd_${Date.now()}`, payment_id: refund[1], amount: body.amount, status: "pending" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
  return { orders, payments };
}

export const paymentSignature = (orderId: string, paymentId: string) => hmacSha256Hex("test_key_secret", `${orderId}|${paymentId}`);
export const webhookSignature = (raw: string) => hmacSha256Hex("test_webhook_secret", raw);
