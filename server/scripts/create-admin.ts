// Creates (or promotes) an administrator from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME.
// There are no built-in admin accounts or default passwords.
import { passwordSchema, emailSchema } from "@shared/validation";
import { hashPassword } from "../src/lib/password.ts";
import { Role, prisma } from "../src/lib/prisma.ts";

const email = emailSchema.safeParse(process.env["ADMIN_EMAIL"] ?? "");
const password = passwordSchema.safeParse(process.env["ADMIN_PASSWORD"] ?? "");
const name = (process.env["ADMIN_NAME"] ?? "").trim() || "Store Admin";
const role = process.env["ADMIN_ROLE"] === "STAFF" ? Role.STAFF : Role.ADMIN;

if (!email.success || !password.success) {
  console.error("Set ADMIN_EMAIL and a strong ADMIN_PASSWORD (8+ characters with a letter and a number) in the environment.");
  process.exit(1);
}

const passwordHash = await hashPassword(password.data);
const user = await prisma.user.upsert({
  where: { email: email.data },
  create: { email: email.data, name, passwordHash, role, emailVerifiedAt: new Date(), profile: { create: {} } },
  update: { role, passwordHash },
});
await prisma.auditLog.create({ data: { actorId: null, action: "admin.bootstrap", entityType: "User", entityId: user.id, metadata: { role } } });
console.log(`${role} account ready for ${user.email}. Remove ADMIN_PASSWORD from the environment now.`);
await prisma.$disconnect();
