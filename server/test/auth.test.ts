import { beforeEach, describe, expect, it } from "vitest";
import { testOutbox } from "../src/lib/mailer.ts";
import { prisma } from "../src/lib/prisma.ts";
import { API, app, client, createUser, resetDb } from "./helpers.ts";
import request from "supertest";

beforeEach(async () => {
  await resetDb();
  testOutbox.length = 0;
});

describe("registration and login", () => {
  it("registers, signs in and out with an HttpOnly session cookie", async () => {
    const c = await client();
    const reg = await c.post("/auth/register", { name: "Priya Sharma", email: "Priya@Example.com", password: "Sunflower2026" });
    expect(reg.status).toBe(201);
    expect(reg.body.data).toMatchObject({ email: "priya@example.com", role: "CUSTOMER", emailVerified: false });
    const cookie = String(reg.headers["set-cookie"]);
    expect(cookie).toMatch(/aez_sid=[^;]+;.*HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: "priya@example.com" } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    // The session token itself is never stored — only its hash.
    const token = /aez_sid=([^;]+)/.exec(cookie)![1]!;
    expect(await prisma.session.count({ where: { tokenHash: token } })).toBe(0);

    expect((await c.get("/auth/me")).body.data.email).toBe("priya@example.com");
    expect((await c.post("/auth/logout")).status).toBe(200);
    expect((await c.get("/auth/me")).body.data).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });

  it("rejects duplicate emails, weak passwords and invalid input", async () => {
    await createUser({ email: "taken@example.com" });
    const c = await client();
    expect((await c.post("/auth/register", { name: "A B", email: "taken@example.com", password: "Sunflower2026" })).status).toBe(409);
    const weak = await c.post("/auth/register", { name: "A B", email: "new@example.com", password: "password" });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details.password).toBeDefined();
  });

  it("does not reveal whether an email exists on failed login", async () => {
    const { user } = await createUser();
    const c = await client();
    const wrong = await c.post("/auth/login", { email: user.email, password: "Wrong-pass-1" });
    const missing = await c.post("/auth/login", { email: "nobody@example.com", password: "Wrong-pass-1" });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.error).toEqual(missing.body.error);
  });

  it("issues a new session on every login (no fixation)", async () => {
    const { user, password } = await createUser();
    const c = await client();
    const first = /aez_sid=([^;]+)/.exec(String((await c.post("/auth/login", { email: user.email, password })).headers["set-cookie"]))![1];
    const second = /aez_sid=([^;]+)/.exec(String((await c.post("/auth/login", { email: user.email, password })).headers["set-cookie"]))![1];
    expect(first).not.toBe(second);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });
});

describe("CSRF and origin protection", () => {
  it("rejects writes without a matching CSRF token", async () => {
    const agent = request.agent(app);
    await agent.get(`${API}/auth/csrf`);
    const res = await agent.post(`${API}/auth/login`).set("origin", "http://localhost:8080").send({ email: "a@b.co", password: "x" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_FAILED");
    const forged = await agent.post(`${API}/auth/login`).set("x-csrf-token", "a".repeat(43)).send({ email: "a@b.co", password: "x" });
    expect(forged.body.error.code).toBe("CSRF_FAILED");
  });

  it("rejects writes from origins outside the allowlist", async () => {
    const c = await client();
    const res = await c.agent.post(`${API}/auth/login`).set("x-csrf-token", c.csrf).set("origin", "https://evil.example").send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("only grants CORS credentials to allowed origins", async () => {
    const allowed = await request(app).get(`${API}/health`).set("origin", "http://localhost:8080");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:8080");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    const denied = await request(app).get(`${API}/health`).set("origin", "https://evil.example");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("password reset", () => {
  it("resets with a single-use emailed token and signs out other sessions", async () => {
    const { user, password } = await createUser({ email: "reset@example.com" });
    const other = await client();
    await other.post("/auth/login", { email: user.email, password });

    const c = await client();
    const forgot = await c.post("/auth/forgot-password", { email: "reset@example.com" });
    expect(forgot.status).toBe(200);
    expect(testOutbox).toHaveLength(1);
    const token = /token=([A-Za-z0-9_-]+)/.exec(testOutbox[0]!.text)![1]!;
    // Only the hash is stored.
    expect(await prisma.authToken.count({ where: { tokenHash: token } })).toBe(0);

    expect((await c.post("/auth/reset-password", { token, password: "NewPassw0rd" })).status).toBe(200);
    expect((await c.post("/auth/reset-password", { token, password: "Another1pass" })).status).toBe(400); // single use
    expect((await other.get("/auth/me")).body.data).toBeNull(); // old session revoked
    expect((await c.post("/auth/login", { email: user.email, password })).status).toBe(401);
    expect((await c.post("/auth/login", { email: user.email, password: "NewPassw0rd" })).status).toBe(200);
  });

  it("answers identically for unknown emails and sends nothing", async () => {
    const c = await client();
    const res = await c.post("/auth/forgot-password", { email: "ghost@example.com" });
    expect(res.status).toBe(200);
    expect(testOutbox).toHaveLength(0);
  });

  it("rejects expired tokens", async () => {
    const { user } = await createUser();
    const c = await client();
    await c.post("/auth/forgot-password", { email: user.email });
    const token = /token=([A-Za-z0-9_-]+)/.exec(testOutbox[0]!.text)![1]!;
    await prisma.authToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await c.post("/auth/reset-password", { token, password: "NewPassw0rd" })).status).toBe(400);
  });
});

describe("account", () => {
  it("changes password only with the current one and keeps this session", async () => {
    const { user, password } = await createUser();
    const c = await client();
    await c.post("/auth/login", { email: user.email, password });
    expect((await c.post("/account/change-password", { currentPassword: "nope", newPassword: "Fresh1password" })).status).toBe(400);
    expect((await c.post("/account/change-password", { currentPassword: password, newPassword: "Fresh1password" })).status).toBe(200);
    expect((await c.get("/auth/me")).body.data.id).toBe(user.id);
  });

  it("manages addresses with a single default and per-user isolation", async () => {
    const { user, password } = await createUser();
    const c = await client();
    await c.post("/auth/login", { email: user.email, password });
    const address = { fullName: "Priya Sharma", phone: "9876543210", line1: "12 Gandhi Street", city: "Tiruppur", state: "Tamil Nadu", pincode: "641604" };
    await c.post("/account/addresses", address);
    const list = (await c.post("/account/addresses", { ...address, line1: "44 Avinashi Road", isDefault: true })).body.data;
    expect(list.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);
    expect(list[0].line1).toBe("44 Avinashi Road");

    const { user: u2, password: p2 } = await createUser();
    const intruder = await client();
    await intruder.post("/auth/login", { email: u2.email, password: p2 });
    expect((await intruder.patch(`/account/addresses/${list[0].id}`, address)).status).toBe(404);
    expect((await intruder.del(`/account/addresses/${list[0].id}`)).status).toBe(404);
    expect((await intruder.get("/account/addresses")).body.data).toHaveLength(0);
  });

  it("requires sign-in for account endpoints", async () => {
    const c = await client();
    expect((await c.get("/account/addresses")).status).toBe(401);
    expect((await c.get("/orders")).status).toBe(401);
    expect((await c.get("/wishlist")).status).toBe(401);
  });
});
