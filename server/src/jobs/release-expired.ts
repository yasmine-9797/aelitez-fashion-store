// Releases stock held by online orders whose payment window has passed.
import { logger } from "../lib/logger.ts";
import { OrderStatus, prisma } from "../lib/prisma.ts";
import { cancelOrderTx, lockOrder } from "../modules/orders/service.ts";

export async function releaseExpiredOrders(now = new Date()): Promise<number> {
  // Safe to run on several API instances at once: each order is re-checked under its row lock below.
  const due = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Order"
    WHERE "status" = 'PENDING_PAYMENT' AND "reservationExpiresAt" IS NOT NULL AND "reservationExpiresAt" < ${now}
    ORDER BY "reservationExpiresAt" LIMIT 100`;
  let released = 0;
  for (const { id } of due) {
    try {
      await prisma.$transaction(async (tx) => {
        const order = await lockOrder(tx, id);
        // Re-check under the lock: the payment may have arrived a moment ago.
        if (order.status !== OrderStatus.PENDING_PAYMENT || !order.reservationExpiresAt || order.reservationExpiresAt >= now) return;
        await cancelOrderTx(tx, order, null, "Payment was not completed in time");
        released++;
      });
    } catch (err) {
      logger.error({ err, orderId: id }, "Failed to release expired order");
    }
  }
  return released;
}

/** Runs the job every minute in-process. Use the CLI script instead for an external scheduler. */
export function startJobs(): () => void {
  const timer = setInterval(() => {
    releaseExpiredOrders()
      .then((n) => n && logger.info({ released: n }, "Released expired unpaid orders"))
      .catch((err) => logger.error({ err }, "Expired-order job failed"));
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
