import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ quiet: true });
const testDb = process.env["TEST_DATABASE_URL"];
if (!testDb) throw new Error("Set TEST_DATABASE_URL (a dedicated database — it is wiped on every test run).");

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "../shared"),
      zod: path.resolve(import.meta.dirname, "node_modules/zod"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // One database, so test files run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDb,
      CORS_ORIGINS: "http://localhost:8080",
      STOREFRONT_URL: "http://localhost:8080",
      PUBLIC_API_URL: "http://localhost:4000",
      COD_ENABLED: "true",
      RAZORPAY_KEY_ID: "rzp_test_key",
      RAZORPAY_KEY_SECRET: "test_key_secret",
      RAZORPAY_WEBHOOK_SECRET: "test_webhook_secret",
      RATE_LIMIT_MULTIPLIER: "100",
      DISABLE_JOBS: "true",
      UPLOAD_DIR: path.resolve(import.meta.dirname, "test/.uploads"),
      SMTP_HOST: "",
    },
  },
});
