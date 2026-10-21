import { expect, request, type APIRequestContext, type Page } from "@playwright/test";

export const WEB = "http://localhost:8180";
export const API = "http://localhost:4100/api/v1";
export const ADMIN = { email: "e2e-admin@example.com", password: "E2e-Admin-Passw0rd" };

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;

/** An API client that behaves like the browser: cookies + CSRF header + allowed Origin. */
export async function apiClient(): Promise<{ ctx: APIRequestContext; post: (path: string, data?: unknown) => Promise<unknown>; get: (path: string) => Promise<unknown> }> {
  const ctx = await request.newContext({ extraHTTPHeaders: { origin: WEB } });
  const csrf = ((await (await ctx.get(`${API}/auth/csrf`)).json()) as { data: { csrfToken: string } }).data.csrfToken;
  const unwrap = async (res: Awaited<ReturnType<APIRequestContext["get"]>>) => {
    const body = (await res.json()) as { data?: unknown; error?: { message: string } };
    expect(res.ok(), body.error?.message).toBeTruthy();
    return body.data;
  };
  return {
    ctx,
    get: async (path) => unwrap(await ctx.get(`${API}${path}`)),
    post: async (path, data = {}) => unwrap(await ctx.post(`${API}${path}`, { data, headers: { "x-csrf-token": csrf } })),
  };
}

/** Places a cash-on-delivery order through the API and returns its order number. */
export async function placeCodOrder(slug = "everyday-tee-and-shorts-set") {
  const api = await apiClient();
  await api.post("/auth/register", { name: "Kavya Iyer", email: uniqueEmail("buyer"), password: "Shopper-Passw0rd" });
  const product = (await api.get(`/products/${slug}`)) as { variants: { id: string; available: number }[] };
  const variant = product.variants.find((v) => v.available > 0);
  if (!variant) throw new Error(`No stock left for ${slug}`);
  await api.post("/cart/items", { variantId: variant.id, quantity: 1 });
  const result = (await api.post("/checkout", {
    contact: { email: "kavya@example.com", phone: "9876543210" },
    address: { fullName: "Kavya Iyer", phone: "9876543210", line1: "21, Kamaraj Road", city: "Coimbatore", state: "Tamil Nadu", pincode: "641018" },
    shippingMethodCode: "standard",
    paymentMethod: "COD",
  })) as { order: { orderNumber: string; id: string } };
  await api.ctx.dispose();
  return result.order;
}

/** Navigates and waits until the app is interactive (the root sets html[data-hydrated]). */
export async function gotoReady(page: Page, path: string) {
  const res = await page.goto(path);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  return res;
}

export async function signIn(page: Page, email: string, password: string) {
  await gotoReady(page, "/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/account/);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `page is ${scroll}px wide in a ${client}px viewport`).toBeLessThanOrEqual(client + 1);
}
