import { pino } from "pino";
import { env, isProduction, isTest } from "../config/env.ts";

/** Structured logger. Secrets and personal data are redacted by path, never logged in full. */
export const logger = pino({
  level: isTest ? "silent" : env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "req.headers['x-csrf-token']",
      "req.headers['x-razorpay-signature']",
      "res.headers['set-cookie']",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.tokenHash",
      "*.secret",
    ],
    censor: "[redacted]",
  },
  // Development: readable single-line output in local time. Production: structured JSON.
  ...(isProduction || isTest
    ? {}
    : { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname,req,res,responseTime", singleLine: true } } }),
});

/** "priya@example.com" → "p***@example.com" for operational log lines. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}
