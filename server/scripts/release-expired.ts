// One-shot run of the expired-payment job, for external schedulers (cron, Render cron jobs, etc.).
import { releaseExpiredOrders } from "../src/jobs/release-expired.ts";
import { prisma } from "../src/lib/prisma.ts";

const released = await releaseExpiredOrders();
console.log(`Released ${released} expired unpaid order(s).`);
await prisma.$disconnect();
