import { createApp } from "./app.ts";
import { emailEnabled, env, razorpayEnabled } from "./config/env.ts";
import { startJobs } from "./jobs/release-expired.ts";
import { logger } from "./lib/logger.ts";
import { prisma } from "./lib/prisma.ts";

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, payments: { razorpay: razorpayEnabled, cod: env.COD_ENABLED }, email: emailEnabled },
    `AELITEZ API listening on :${env.PORT}`,
  );
});
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.error(`Port ${env.PORT} is already in use — the API is probably already running in another terminal. Stop it, or set PORT to another value.`);
  } else {
    logger.error({ err }, "API server failed to start");
  }
  process.exit(1);
});
const stopJobs = env.DISABLE_JOBS ? () => undefined : startJobs();

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  stopJobs();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => logger.error({ err }, "Unhandled promise rejection"));
