// Validated configuration. The process refuses to start with missing or unsafe settings.
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ quiet: true });

const bool = (fallback: boolean) =>
  z.preprocess((v) => (v === undefined || v === "" ? fallback : ["1", "true", "yes"].includes(String(v).toLowerCase())), z.boolean());
const int = (fallback: number, min = 0) =>
  z.preprocess((v) => (v === undefined || v === "" ? fallback : v), z.coerce.number().int().min(min));
const optionalString = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: int(4000, 1),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TRUST_PROXY: int(0),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  STOREFRONT_URL: z.string().url().default("http://localhost:8080"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:8080")
    .transform((v) => v.split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean)),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: optionalString,

  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,
  RAZORPAY_API_BASE: z.string().url().default("https://api.razorpay.com/v1"),
  COD_ENABLED: bool(false),
  PAYMENT_TIMEOUT_MINUTES: int(30, 5),

  SMTP_HOST: optionalString,
  SMTP_PORT: int(587, 1),
  SMTP_SECURE: bool(false),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM: z.string().default("AELITEZ CLOTHINGS <no-reply@example.com>"),

  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_UPLOAD_MB: int(5, 1),

  RETURN_WINDOW_DAYS: int(7, 0),
  MAX_CART_QUANTITY: int(10, 1),

  /** Disables in-process background jobs (tests run them explicitly). */
  DISABLE_JOBS: bool(false),
  /** Multiplier for rate limits — tests raise it so suites are not throttled. */
  RATE_LIMIT_MULTIPLIER: int(1, 1),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    const problems: string[] = [];
    if (env.CORS_ORIGINS.some((o) => o === "*" || o.startsWith("http://localhost"))) problems.push("CORS_ORIGINS must list your real storefront origin(s)");
    if (!env.PUBLIC_API_URL.startsWith("https://")) problems.push("PUBLIC_API_URL must use https");
    if (!env.STOREFRONT_URL.startsWith("https://")) problems.push("STOREFRONT_URL must use https");
    const razorpayParts = [env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET].filter(Boolean).length;
    if (razorpayParts !== 0 && razorpayParts !== 3) problems.push("Set all of RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET, or none");
    if (problems.length) throw new Error(`Unsafe production configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  return env;
}

export const env = load();

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

/**
 * Whether a browser origin may call the API. Production allows only CORS_ORIGINS. In development,
 * any localhost port is also allowed, so it doesn't matter which port Vite picks (8080, 8081, …).
 */
export function originAllowed(origin: string, allowlist: readonly string[] = env.CORS_ORIGINS, mode: Env["NODE_ENV"] = env.NODE_ENV): boolean {
  const o = origin.replace(/\/$/, "");
  return allowlist.includes(o) || (mode === "development" && LOCAL_ORIGIN.test(o));
}

/** Online payments are offered only when the gateway is fully configured. */
export const razorpayEnabled = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET);
export const emailEnabled = Boolean(env.SMTP_HOST);
