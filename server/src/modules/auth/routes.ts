import { Router } from "express";
import { z } from "zod";
import {
  addressSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
} from "@shared/validation";
import type { AddressDTO } from "@shared/types";
import { currentUser, requireAuth } from "../../middleware/auth.ts";
import { issueCsrfToken } from "../../middleware/csrf.ts";
import { loginAccountLimiter, loginIpLimiter, passwordResetLimiter, registerLimiter, writeLimiter } from "../../middleware/rate-limit.ts";
import { conflict, notFound } from "../../lib/errors.ts";
import { ok, parse, param } from "../../lib/http.ts";
import { prisma, type Tx } from "../../lib/prisma.ts";
import * as auth from "./service.ts";

export const authRouter = Router();

authRouter.get("/auth/csrf", (req, res) => {
  res.json(ok({ csrfToken: issueCsrfToken(req, res) }));
});

authRouter.get("/auth/me", async (req, res) => {
  res.json(ok(req.user ? await auth.toUserDTO(req.user.id) : null));
});

authRouter.post("/auth/register", registerLimiter, async (req, res) => {
  const input = parse(registerSchema, req.body);
  res.status(201).json(ok(await auth.register(req, res, input)));
});

authRouter.post("/auth/login", loginIpLimiter, loginAccountLimiter, async (req, res) => {
  const input = parse(loginSchema, req.body);
  res.json(ok(await auth.login(req, res, input)));
});

authRouter.post("/auth/logout", async (req, res) => {
  await auth.logout(req, res);
  res.json(ok({ signedOut: true }));
});

authRouter.post("/auth/forgot-password", passwordResetLimiter, async (req, res) => {
  const { email } = parse(forgotPasswordSchema, req.body);
  await auth.forgotPassword(email);
  res.json(ok({ message: "If an account exists for that email, we've sent a link to reset the password." }));
});

authRouter.post("/auth/reset-password", passwordResetLimiter, async (req, res) => {
  const { token, password } = parse(resetPasswordSchema, req.body);
  await auth.resetPassword(token, password);
  res.json(ok({ reset: true }));
});

authRouter.post("/auth/verify-email", writeLimiter, async (req, res) => {
  const { token } = parse(z.object({ token: z.string().min(20).max(200) }), req.body);
  await auth.verifyEmail(token);
  res.json(ok({ verified: true }));
});

authRouter.post("/auth/resend-verification", requireAuth, writeLimiter, async (req, res) => {
  await auth.sendVerification(currentUser(req).id);
  res.json(ok({ sent: true }));
});

// ───────────── Account ─────────────

authRouter.patch("/account/profile", requireAuth, async (req, res) => {
  const user = currentUser(req);
  const input = parse(profileSchema, req.body);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: input.name,
      profile: {
        upsert: {
          create: { phone: input.phone ?? null, marketingConsent: input.marketingConsent ?? false },
          update: { phone: input.phone ?? null, ...(input.marketingConsent !== undefined ? { marketingConsent: input.marketingConsent } : {}) },
        },
      },
    },
  });
  res.json(ok(await auth.toUserDTO(user.id)));
});

authRouter.post("/account/change-password", requireAuth, loginAccountLimiter, async (req, res) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  await auth.changePassword(req, currentPassword, newPassword);
  res.json(ok({ changed: true }));
});

const toAddress = (a: AddressDTO): AddressDTO => ({
  id: a.id,
  fullName: a.fullName,
  phone: a.phone,
  line1: a.line1,
  line2: a.line2,
  landmark: a.landmark,
  city: a.city,
  state: a.state,
  pincode: a.pincode,
  isDefault: a.isDefault,
});

const listAddresses = (userId: string) =>
  prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }).then((rows) => rows.map(toAddress));

/** Makes one address the default, clearing the flag on the customer's others first. */
async function setDefault(tx: Tx, userId: string, addressId: string) {
  await tx.address.updateMany({ where: { userId, isDefault: true, id: { not: addressId } }, data: { isDefault: false } });
  await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
}

authRouter.get("/account/addresses", requireAuth, async (req, res) => {
  res.json(ok(await listAddresses(currentUser(req).id)));
});

authRouter.post("/account/addresses", requireAuth, async (req, res) => {
  const user = currentUser(req);
  const { isDefault, ...input } = parse(addressSchema, req.body);
  await prisma.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { userId: user.id } });
    if (count >= 20) throw conflict("You can save up to 20 addresses. Remove one to add another.", "ADDRESS_LIMIT");
    const created = await tx.address.create({ data: { ...input, line2: input.line2 ?? null, landmark: input.landmark ?? null, userId: user.id } });
    if (isDefault || count === 0) await setDefault(tx, user.id, created.id);
  });
  res.status(201).json(ok(await listAddresses(user.id)));
});

authRouter.patch("/account/addresses/:id", requireAuth, async (req, res) => {
  const user = currentUser(req);
  const { isDefault, ...input } = parse(addressSchema, req.body);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.address.updateMany({ where: { id: param(req, "id"), userId: user.id }, data: { ...input, line2: input.line2 ?? null, landmark: input.landmark ?? null } });
    if (updated.count !== 1) throw notFound("Address");
    if (isDefault) await setDefault(tx, user.id, param(req, "id"));
  });
  res.json(ok(await listAddresses(user.id)));
});

authRouter.delete("/account/addresses/:id", requireAuth, async (req, res) => {
  const user = currentUser(req);
  await prisma.$transaction(async (tx) => {
    const target = await tx.address.findFirst({ where: { id: param(req, "id"), userId: user.id } });
    if (!target) throw notFound("Address");
    await tx.address.delete({ where: { id: target.id } });
    if (target.isDefault) {
      const next = await tx.address.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
      if (next) await setDefault(tx, user.id, next.id);
    }
  });
  res.json(ok(await listAddresses(user.id)));
});
