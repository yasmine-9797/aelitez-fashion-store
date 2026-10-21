// Inventory operations. Each one is a single conditional UPDATE, so concurrent checkouts can
// never oversell: PostgreSQL re-evaluates the WHERE clause under the row lock, and the CHECK
// constraints (onHand >= 0, 0 <= reserved <= onHand) are a second line of defence.
import { AppError, conflict, notFound } from "../../lib/errors.ts";
import { InventoryMovementType, type Tx } from "../../lib/prisma.ts";

export class OutOfStockError extends AppError {
  constructor(readonly variantId: string) {
    super(409, "OUT_OF_STOCK", "Some items in your bag are no longer available in the quantity you chose.");
  }
}

/** Holds stock for an unpaid order. Throws OutOfStockError if not enough is available. */
export async function reserveStock(tx: Tx, variantId: string, quantity: number, orderId: string): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "Inventory" SET "reserved" = "reserved" + ${quantity}, "updatedAt" = now()
    WHERE "variantId" = ${variantId} AND "onHand" - "reserved" >= ${quantity}`;
  if (updated !== 1) throw new OutOfStockError(variantId);
  await tx.inventoryMovement.create({
    data: { variantId, type: InventoryMovementType.RESERVATION, reservedDelta: quantity, orderId, reason: "Reserved at checkout" },
  });
}

/** Converts a reservation into a sale once the order is confirmed (paid or cash on delivery). */
export async function commitReservedStock(tx: Tx, variantId: string, quantity: number, orderId: string): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "Inventory" SET "onHand" = "onHand" - ${quantity}, "reserved" = "reserved" - ${quantity}, "updatedAt" = now()
    WHERE "variantId" = ${variantId} AND "reserved" >= ${quantity} AND "onHand" >= ${quantity}`;
  if (updated !== 1) throw new Error(`Inventory reservation missing for variant ${variantId} on order ${orderId}`);
  await tx.inventoryMovement.create({
    data: { variantId, type: InventoryMovementType.SALE, onHandDelta: -quantity, reservedDelta: -quantity, orderId, reason: "Order confirmed" },
  });
}

/** Returns reserved stock to sale (unpaid order cancelled or expired). */
export async function releaseReservedStock(tx: Tx, variantId: string, quantity: number, orderId: string, reason: string): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "Inventory" SET "reserved" = "reserved" - ${quantity}, "updatedAt" = now()
    WHERE "variantId" = ${variantId} AND "reserved" >= ${quantity}`;
  if (updated !== 1) throw new Error(`Inventory reservation missing for variant ${variantId} on order ${orderId}`);
  await tx.inventoryMovement.create({
    data: { variantId, type: InventoryMovementType.RELEASE, reservedDelta: -quantity, orderId, reason },
  });
}

/** Puts sold units back on hand (cancellation after confirmation, or a received return). */
export async function restock(
  tx: Tx,
  variantId: string,
  quantity: number,
  type: typeof InventoryMovementType.CANCELLATION_RESTOCK | typeof InventoryMovementType.RETURN_RESTOCK,
  orderId: string,
  actorId: string | null,
  reason: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Inventory" SET "onHand" = "onHand" + ${quantity}, "updatedAt" = now() WHERE "variantId" = ${variantId}`;
  await tx.inventoryMovement.create({ data: { variantId, type, onHandDelta: quantity, orderId, actorId, reason } });
}

/**
 * Manual stock correction by staff. On-hand stock can never drop below what is already
 * reserved for unpaid orders.
 */
export async function adjustStock(tx: Tx, variantId: string, delta: number, actorId: string, reason: string) {
  if (!Number.isInteger(delta) || delta === 0) throw conflict("Enter a non-zero whole number.", "INVALID_ADJUSTMENT");
  const exists = await tx.inventory.findUnique({ where: { variantId }, select: { variantId: true } });
  if (!exists) throw notFound("Variant");
  const updated = await tx.$executeRaw`
    UPDATE "Inventory" SET "onHand" = "onHand" + ${delta}, "updatedAt" = now()
    WHERE "variantId" = ${variantId} AND "onHand" + ${delta} >= "reserved"`;
  if (updated !== 1) throw conflict("That would leave less stock than is already reserved for open orders.", "BELOW_RESERVED");
  await tx.inventoryMovement.create({ data: { variantId, type: InventoryMovementType.ADJUSTMENT, onHandDelta: delta, actorId, reason } });
  return tx.inventory.findUniqueOrThrow({ where: { variantId } });
}
