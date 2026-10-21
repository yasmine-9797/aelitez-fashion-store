import type { Db } from "./prisma.ts";
import { Prisma } from "./prisma.ts";

/** Records a significant administrative or security-relevant action. Never pass secrets in metadata. */
export async function audit(
  db: Db,
  entry: { actorId: string | null; action: string; entityType: string; entityId?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ? (entry.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
}
